from mcp.server.fastmcp import FastMCP
from .rag import answer_question, supabase

# Wir erstellen den Server
mcp = FastMCP("CampNode")

@mcp.tool()
def ask_course_knowledge(course_id: str, question: str) -> str:
    """Beantwortet Fragen basierend auf Kurs-PDFs und Material."""
    result = answer_question(course_id, question)
    return f"Antwort: {result['answer']}\nQuellen: {', '.join(result['sources'])}"

@mcp.tool()
def list_available_courses() -> str:
    """Zeigt alle verfügbaren Kurse im CampNode-System."""
    response = supabase.table("Course").select("id, title").execute()
    courses = response.data
    text = "\n".join([f"- {c['title']} (ID: {c['id']})" for c in courses])
    return f"Verfügbare Kurse:\n{text}"

@mcp.tool()
def get_course_topics(course_id: str) -> str:
    """Zeigt alle Themen, Wikidata-Links und Inhalte eines Kurses an."""
    response = supabase.table("Topic").select("name, content, wikipediaTitle").eq("course_id", course_id).execute()
    topics = response.data
    text = "\n\n".join([
        f"Thema: {t['name']}\nWiki: {t.get('wikipediaTitle', 'N/A')}\nInhalt: {t.get('content', 'Kein Text')[:300]}..." 
        for t in topics
    ])
    return f"Themenübersicht für Kurs {course_id}:\n{text}"

if __name__ == "__main__":
    mcp.run(transport='stdio')
