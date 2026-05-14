from openai import OpenAI
from .config import OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
from supabase import create_client, Client
from .prompts import ANSWER_PROMPT


# 1. Clients für OpenAI (umgeleitet auf Google Gemini) und Supabase vorbereiten
openai_client = OpenAI(
    api_key=OPENAI_API_KEY,
    base_url="https://generativelanguage.googleapis.com/v1beta/openai/"
)
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def create_embedding(text: str):
    """
    Wandelt einen Text in einen Vektor (Zahlenreihe) um.
    """ 
    
    # Gemini arbeitet am besten, wenn wir Zeilenumbrüche entfernen
    clean_text = text.replace("\n", " ")
    
    # API Aufruf an OpenAI
    response = openai_client.embeddings.create(
        input=[clean_text],
        model="gemini-embedding-001"
    )
    
    # Wir geben nur die Liste von Zahlen zurück
    return response.data[0].embedding


def search_chunks(course_id: str, question: str, limit: int = 3):
    """
    Sucht in Supabase nach den Textabschnitten, die am besten zur Frage passen.
    """
    # 1. Wir verwandeln die Frage in einen Vektor
    question_embedding = create_embedding(question)
    
    # 2. Wir rufen unsere SQL-Funktion in Supabase auf
    response = supabase.rpc(
        "match_ai_chunks",
        {
            "query_embedding": question_embedding,
            "match_count": limit,
            "p_course_id": course_id
        }
    ).execute()
    
    # 3. Wir geben die gefundenen Abschnitte zurück
    return response.data



def answer_question(course_id: str, question: str):
    """
    Sucht nach Quellen und beantwortet die Frage des Studenten.
    """
    is_json_request = "valid JSON object matching this schema" in question

    # 1. Wir suchen die besten Textabschnitte in Supabase
    chunks = search_chunks(course_id, question, limit=3)
    
    # Wenn wir nichts finden, sagen wir das sofort (Halluzinations-Schutz!)
    # Except if it's a JSON request, we still want the LLM to generate the JSON (e.g. topic suggestions don't strictly need chunks).
    if not chunks and not is_json_request:
        return {
            "answer": "Im verfügbaren Kursmaterial gibt es dazu nicht genug Informationen.",
            "sources": []
        }
    
    # 2. Wir kleben alle gefundenen Texte zu einem großen "Kontext" zusammen
    context_text = "\n\n".join([chunk["content"] for chunk in chunks]) if chunks else "Kein Kontext verfügbar."
    
    # Wir sammeln auch die Quellen-Titel, um sie dem Studenten später zu zeigen
    sources = list(set([f"{chunk['title']} (Seite {chunk['page_number']})" for chunk in chunks])) if chunks else []
    
    # 3. Wir füllen unser Prompt-Template mit dem Kontext und der Frage
    prompt = ANSWER_PROMPT.format(context=context_text, question=question)
    
    messages = [
        {"role": "system", "content": "You are a helpful learning assistant. If the user requests JSON, you must return ONLY valid JSON without any markdown formatting."},
        {"role": "user", "content": prompt}
    ]

    kwargs = {
        "model": "gemini-2.5-flash",
        "messages": messages,
        "temperature": 0.3
    }

    if is_json_request:
        kwargs["response_format"] = {"type": "json_object"}

    # 4. Wir schicken alles an OpenAI (gpt-4o-mini ist schnell und günstig)
    response = openai_client.chat.completions.create(**kwargs)
    
    # 5. Wir geben die Antwort und die Quellen zurück
    return {
        "answer": response.choices[0].message.content,
        "sources": sources
    }
