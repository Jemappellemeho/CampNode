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
    try:
        response = supabase.table("Course").select("id, title").execute()
        courses = response.data
        if not courses:
            return "Keine Kurse gefunden."
        text = "\n".join([f"- {c['title']} (ID: {c['id']})" for c in courses])
        return f"Verfügbare Kurse:\n{text}"
    except Exception as e:
        print(f"Error in list_available_courses: {e}")
        return f"Fehler beim Laden der Kurse: {str(e)}"

@mcp.tool()
def get_course_topics(course_id: str) -> str:
    """Zeigt alle Themen, Wikidata-Links und Inhalte eines Kurses an."""
    try:
        print(f"MCP: Fetching topics for course_id: {course_id}")
        response = supabase.table("Topic").select("name, content, wikipediaTitle").eq("courseId", course_id).execute()
        topics = response.data
        print(f"MCP: Found {len(topics) if topics else 0} topics for course {course_id}")
        
        if not topics:
            return f"Keine Themen für Kurs ID {course_id} gefunden."
        
        topic_list = []
        for t in topics:
            if not isinstance(t, dict):
                continue
            name = t.get('name', 'Unbekanntes Thema')
            wiki = t.get('wikipediaTitle', 'N/A')
            content = t.get('content', 'Kein Text') or "Kein Text"
            topic_list.append(f"Thema: {name}\nWiki: {wiki}\nInhalt: {content[:300]}...")

        text = "\n\n".join(topic_list)
        return f"Themenübersicht für Kurs {course_id}:\n{text}"
    except Exception as e:
        import traceback
        print(f"Error in get_course_topics for course {course_id}: {e}")
        traceback.print_exc()
        return f"Fehler beim Laden der Themen für Kurs {course_id}: {str(e)}"

if __name__ == "__main__":
    mcp.run(transport='stdio')
