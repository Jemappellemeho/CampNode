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
    # 1. Wir suchen die besten Textabschnitte in Supabase
    chunks = search_chunks(course_id, question, limit=3)
    
    # Wenn wir keine Chunks in den RAG-Tabellen finden, prüfen wir, ob wir das Material aus den vorhandenen Kursthemen importieren können (Self-Healing)
    if not chunks:
        try:
            print(f"[RAG-Self-Healing] Checking for existing topic contents in database for course_id: {course_id}")
            # Lade alle Themen mit Textinhalten für diesen Kurs
            topics_response = supabase.table("Topic").select("name, content").eq("courseId", course_id).not_.is_("content", "null").execute()
            topics_data = topics_response.data
            
            if topics_data:
                print(f"[RAG-Self-Healing] Found {len(topics_data)} topics with content. Ingesting on-the-fly into RAG tables...")
                from .ingest import ingest_course_material
                for topic in topics_data:
                    if topic.get("content") and topic.get("content").strip():
                        print(f"[RAG-Self-Healing] Ingesting topic: {topic['name']}")
                        ingest_course_material(course_id, topic["name"], topic["content"])
                
                # Nach dem erfolgreichen Import suchen wir die Chunks erneut!
                chunks = search_chunks(course_id, question, limit=3)
                print(f"[RAG-Self-Healing] Rerunning search. Chunks found: {len(chunks) if chunks else 0}")
        except Exception as e:
            print(f"[RAG-Self-Healing] Error during on-the-fly ingestion: {e}")

    # Wenn wir immer noch nichts finden, sagen wir das sofort (Halluzinations-Schutz!)
    if not chunks:
        return {
            "answer": "Im verfügbaren Kursmaterial gibt es dazu nicht genug Informationen.",
            "sources": []
        }
    
    # 2. Wir kleben alle gefundenen Texte zu einem großen "Kontext" zusammen
    context_text = "\n\n".join([chunk["content"] for chunk in chunks])
    
    # Wir sammeln auch die Quellen-Titel, um sie dem Studenten später zu zeigen
    sources = list(set([f"{chunk['title']} (Seite {chunk['page_number']})" for chunk in chunks]))
    
    # 3. Wir füllen unser Prompt-Template mit dem Kontext und der Frage
    prompt = ANSWER_PROMPT.format(context=context_text, question=question)
    
    # 4. Wir schicken alles an OpenAI (gpt-4o-mini ist schnell und günstig)
    response = openai_client.chat.completions.create(
        model="gemini-2.5-flash",
        messages=[
            {"role": "system", "content": "You are a helpful learning assistant."},
            {"role": "user", "content": prompt}
        ],
        temperature=0.3 # Niedrige Temperatur = weniger erfinden, strikt an Fakten halten
    )
    
    # 5. Wir geben die Antwort und die Quellen zurück
    return {
        "answer": response.choices[0].message.content,
        "sources": sources
    }
