import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, UploadFile, File, Query, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field
from sqlmodel import Session, select
from typing import Literal

# Separate agent imports
from topic_agent import generate_quiz_from_topic
from pdf_agent import NoSelectableTextError, extract_text_from_pdf, generate_quiz_from_pdf_content
from auth import create_access_token, get_current_user, hash_password, verify_password
from models import User, create_db_and_tables, get_session

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

app = FastAPI(title="Intelligent Quiz Agent API")
MAX_PDF_SIZE_BYTES = int(os.getenv("MAX_PDF_SIZE_BYTES", str(10 * 1024 * 1024)))
frontend_origins = [
    origin.strip()
    for origin in os.getenv("FRONTEND_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]


@app.on_event("startup")
def on_startup():
    create_db_and_tables()

# Allow frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class QuizRequest(BaseModel):
    topic: str = Field(min_length=1, max_length=200)
    difficulty: Literal["Mixed", "Easy", "Medium", "Hard"] = "Mixed"
    question_count: Literal[5, 10, 15] = 10


class SignupRequest(BaseModel):
    username: str = Field(min_length=2, max_length=50)
    email: EmailStr
    password: str = Field(min_length=6, max_length=72)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


@app.get("/")
def read_root():
    return {"message": "Welcome to the Intelligent Quiz Platform API!"}


@app.post("/auth/signup", status_code=status.HTTP_201_CREATED)
def signup(request: SignupRequest, session: Session = Depends(get_session)):
    existing_user = session.exec(
        select(User).where((User.username == request.username) | (User.email == request.email))
    ).first()
    if existing_user:
        raise HTTPException(status_code=409, detail="Username or email is already registered.")

    user = User(
        username=request.username.strip(),
        email=request.email.lower(),
        hashed_password=hash_password(request.password),
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return {
        "access_token": create_access_token(user.id),
        "token_type": "bearer",
        "user": {"id": user.id, "username": user.username, "email": user.email},
    }


@app.post("/auth/login")
def login(request: LoginRequest, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.email == request.email.lower())).first()
    if user is None or not verify_password(request.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")
    return {
        "access_token": create_access_token(user.id),
        "token_type": "bearer",
        "user": {"id": user.id, "username": user.username, "email": user.email},
    }


@app.get("/auth/me")
def auth_me(current_user: User = Depends(get_current_user)):
    return {"id": current_user.id, "username": current_user.username, "email": current_user.email}


# Agent 1: Topic-based Quiz Generation
@app.post("/generate-quiz")
def create_quiz(request: QuizRequest):
    try:
        quiz_data = generate_quiz_from_topic(
            request.topic,
            difficulty=request.difficulty,
            question_count=request.question_count,
        )
    except Exception as error:
        if "429" in str(error) or "quota" in str(error).lower() or "rate limit" in str(error).lower():
            raise HTTPException(status_code=429, detail="API limit reached. Please retry in a few moments.") from error
        raise HTTPException(status_code=500, detail="Quiz generation is temporarily unavailable. Please try again.") from error
    return {"status": "success", "quiz": quiz_data}

# Agent 2: Document/PDF-based Quiz Generation
@app.post("/generate-quiz-pdf")
async def create_quiz_from_pdf(
    file: UploadFile = File(...),
    difficulty: Literal["Mixed", "Easy", "Medium", "Hard"] = Query(default="Mixed"),
    question_count: int = Query(default=10),
):
    if question_count not in (5, 10, 15):
        raise HTTPException(status_code=422, detail="Question count must be 5, 10, or 15.")
    if difficulty not in ("Mixed", "Easy", "Medium", "Hard"):
        raise HTTPException(status_code=422, detail="Difficulty must be Mixed, Easy, Medium, or Hard.")

    if file.content_type not in (None, "application/pdf"):
        raise HTTPException(status_code=415, detail="Please upload a PDF file.")

    content = await file.read(MAX_PDF_SIZE_BYTES + 1)
    if len(content) > MAX_PDF_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"PDF is too large. Maximum size is {MAX_PDF_SIZE_BYTES // (1024 * 1024)} MB.",
        )
    try:
        extracted_text = extract_text_from_pdf(content)
        quiz_data = generate_quiz_from_pdf_content(
            extracted_text,
            difficulty=difficulty,
            question_count=question_count,
        )
    except NoSelectableTextError as error:
        raise HTTPException(status_code=400, detail="No selectable text found in PDF.") from error
    except Exception as error:
        if "429" in str(error) or "quota" in str(error).lower() or "rate limit" in str(error).lower():
            raise HTTPException(status_code=429, detail="API limit reached. Please retry in a few moments.") from error
        raise HTTPException(status_code=500, detail="PDF quiz generation is temporarily unavailable. Please try again.") from error
    
    return {
        "status": "success",
        "filename": file.filename,
        "quiz": quiz_data
    }