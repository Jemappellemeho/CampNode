from .rag import create_embedding, supabase

def chunk_text(text: str, max_words: int = 150):
    """
    Zerteilt einen langen Text in kleine, verdauliche Abschnitte (Chunks).
    """
    words = text.split()
    chunks = []
    for i in range(0, len(words), max_words):
        chunk = " ".join(words[i:i + max_words])
        chunks.append(chunk)
    return chunks

def ingest_course_material(course_id: str, title: str, content: str):
    """
    Speichert einen Text als neue Quelle und zerteilt ihn in durchsuchbare Chunks.
    """
    source_response = supabase.table("ai_sources").insert({
        "course_id": course_id,
        "title": title,
        "source_type": "text",
        "approved": True
    }).execute()
    
    source_id = source_response.data[0]["id"]
    chunks = chunk_text(content)
    
    for index, chunk_content in enumerate(chunks):
        embedding = create_embedding(chunk_content)
        
        supabase.table("ai_chunks").insert({
            "course_id": course_id,
            "source_id": source_id,
            "content": chunk_content,
            "chunk_index": index,
            "embedding": embedding
        }).execute()
        
    return {"message": f"Erfolgreich {len(chunks)} Chunks für '{title}' gespeichert!"}
