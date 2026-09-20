import io
import json
import os
import re
from dotenv import load_dotenv
from pypdf import PdfReader
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_groq import ChatGroq
from langchain_core.prompts import PromptTemplate

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)

load_dotenv(os.path.join(BASE_DIR, ".env"))
load_dotenv(os.path.join(PROJECT_ROOT, ".env"))

gemini_key = os.getenv("GEMINI_API_KEY")
groq_key = os.getenv("GROQ_API_KEY")

def _execute_prompt_with_fallback(prompt_template, input_payload):
    if gemini_key:
        try:
            gemini_llm = ChatGoogleGenerativeAI(
                model="gemini-3.6-flash",
                temperature=0.5,
                google_api_key=gemini_key,
            )
            return (prompt_template | gemini_llm).invoke(input_payload).content
        except Exception as gemini_error:
            print(f"[Fallback Trigger] Gemini failed ({gemini_error}). Switching to Groq...")

    if groq_key:
        try:
            groq_llm = ChatGroq(
                model="openai/gpt-oss-120b",
                temperature=0.5,
                groq_api_key=groq_key,
            )
            return (prompt_template | groq_llm).invoke(input_payload).content
        except Exception as groq_error:
            print(f"[Error] Groq also failed: {groq_error}")
            raise groq_error

    raise RuntimeError("Dono LLM providers (Gemini aur Groq) unavailable hain ya keys missing hain.")


def _parse_quiz_json(raw_response):
    if isinstance(raw_response, list):
        raw_text = "".join(
            item.get("text", "") if isinstance(item, dict) else str(item)
            for item in raw_response
        )
    elif isinstance(raw_response, dict):
        raw_text = raw_response.get("text", str(raw_response))
    else:
        raw_text = str(raw_response)

    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        match = re.search(r"```(?:json)?\s*(.*?)\s*```", cleaned, re.DOTALL | re.IGNORECASE)
        if match:
            cleaned = match.group(1).strip()

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end != -1 and end > start:
        cleaned = cleaned[start : end + 1]

    return json.loads(cleaned)


class NoSelectableTextError(ValueError):
    """Raised when a PDF contains no text layer, usually because it is scanned."""


def extract_text_from_pdf(file_bytes: bytes) -> str:
    pdf_reader = PdfReader(io.BytesIO(file_bytes))
    pages_text = []
    for page in pdf_reader.pages:
        text = page.extract_text()
        if text:
            pages_text.append(text.strip())

    extracted_text = "\n\n".join(text for text in pages_text if text)
    if not extracted_text:
        raise NoSelectableTextError("No selectable text found in PDF.")
    return extracted_text


def _build_context_chunks(pdf_text: str, chunk_size: int = 4500, max_chunks: int = 6) -> str:
    """Keep bounded context while sampling evenly across long documents."""
    chunks = [
        pdf_text[index : index + chunk_size]
        for index in range(0, len(pdf_text), chunk_size)
    ]
    if len(chunks) <= max_chunks:
        return "\n\n--- Document section ---\n\n".join(chunks)

    selected_indexes = {
        round(index * (len(chunks) - 1) / (max_chunks - 1))
        for index in range(max_chunks)
    }
    return "\n\n--- Document section ---\n\n".join(chunks[index] for index in sorted(selected_indexes))


def generate_quiz_from_pdf_content(pdf_text: str, difficulty: str = "Mixed", question_count: int = 10):
    document_context = _build_context_chunks(pdf_text)

    prompt = PromptTemplate.from_template(
        """You are an expert teacher. Based on the document context below, generate exactly {question_count} unique multiple-choice questions.
        Requirements:
        - The requested difficulty is {difficulty}. If it is Mixed, balance easy, medium, and hard questions.
        - Cover different sections and ideas from the document, not repeated versions of the same idea
        - Make the questions varied in wording and structure so they are not repetitive
        - Include a short 1-2 sentence explanation of why the correct answer is right
        Output strictly in JSON format with a list of 'questions'. 
        Each question must have 'question_text', 'options' (list of 4 strings), 'correct_answer', and 'explanation'.
        Ensure the correct_answer matches one of the options exactly.
        Do not output any other text besides the JSON.

        Document Context:
        {context}"""
    )
    raw_content = _execute_prompt_with_fallback(prompt, {
        "context": document_context,
        "difficulty": difficulty,
        "question_count": question_count,
    })
    return _parse_quiz_json(raw_content)