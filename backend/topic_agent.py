import json
import os
import re
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_groq import ChatGroq
from langchain_core.prompts import PromptTemplate
from langchain_tavily import TavilySearch

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)

load_dotenv(os.path.join(BASE_DIR, ".env"))
load_dotenv(os.path.join(PROJECT_ROOT, ".env"))

gemini_key = os.getenv("GEMINI_API_KEY")
groq_key = os.getenv("GROQ_API_KEY")
tavily_key = os.getenv("TAVILY_API_KEY")

# Tavily Tool Initialization
search_tool = None
if tavily_key:
    try:
        search_tool = TavilySearch(max_results=3, tavily_api_key=tavily_key)
    except Exception as err:
        print(f"[Warning] Could not initialize TavilySearch: {err}")


def _parse_quiz_json(raw_response):
    if isinstance(raw_response, list):
        raw_text = "".join(item.get("text", "") if isinstance(item, dict) else str(item) for item in raw_response)
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


def _execute_prompt_with_fallback(prompt_template, input_payload):
    """Pehle Gemini try karega. Fail/Quota hone par Groq (Llama-3) par switch hoga."""
    # 1. Primary Attempt: Google Gemini
    if gemini_key:
        try:
            gemini_llm = ChatGoogleGenerativeAI(
                model="gemini-3.6-flash",
                temperature=0.5,
                google_api_key=gemini_key,
            )
            chain = prompt_template | gemini_llm
            response = chain.invoke(input_payload)
            return response.content
        except Exception as gemini_err:
            print(f"[Fallback Trigger] Gemini failed ({gemini_err}). Switching to Groq...")

    # 2. Backup Attempt: Groq (Llama-3)
    if groq_key:
        try:
            groq_llm = ChatGroq(
                model="openai/gpt-oss-120b",
                temperature=0.5,
                groq_api_key=groq_key,
            )
            chain = prompt_template | groq_llm
            response = chain.invoke(input_payload)
            return response.content
        except Exception as groq_err:
            print(f"[Error] Groq also failed: {groq_err}")
            raise groq_err

    raise RuntimeError("Dono LLM providers (Gemini aur Groq) unavailable hain ya keys missing hain.")


def generate_quiz_from_topic(topic: str, difficulty: str = "Mixed", question_count: int = 10):
    # Step 1: Tavily Tool Call
    web_context = "No live web context available."
    if search_tool:
        try:
            print(f"[Tool Execution] Searching web via Tavily for: '{topic}'...")
            search_results = search_tool.invoke({"query": topic})
            if isinstance(search_results, list):
                web_context = "\n\n".join([r.get("content", "") for r in search_results if isinstance(r, dict)])
            else:
                web_context = str(search_results)
        except Exception as e:
            print(f"[Tool Warning] Tavily search fallback: {e}")

    # Step 2: Prompt Setup
    prompt = PromptTemplate.from_template(
        """You are an expert teacher. Generate exactly {question_count} unique multiple-choice questions about {topic}.

Live Web/Search Context:
{web_context}

Requirements:
- Difficulty: {difficulty}.
- Distinct concepts, no repetition.
- Include a 1-2 sentence explanation of why the correct answer is right.
Output strictly valid JSON with a 'questions' list. Each question must have 'question_text', 'options' (4 strings), 'correct_answer', and 'explanation'.
Do not output markdown ticks or conversational text."""
    )

    # Step 3: Run with Fallback
    raw_content = _execute_prompt_with_fallback(prompt, {
        "topic": topic,
        "difficulty": difficulty,
        "question_count": question_count,
        "web_context": web_context,
    })

    return _parse_quiz_json(raw_content)