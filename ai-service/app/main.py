from fastapi import FastAPI
from pydantic import BaseModel
from .rag import answer_question
from .ingest import ingest_course_material


# Initialisiere unsere FastAPI Anwendung
app = FastAPI(title="CampNode AI Service")


# Ein simpler Test-Endpunkt. Wenn wir localhost:8001/ im Browser öffnen,
# sehen wir diese Nachricht.
@app.get("/")
def read_root():
    return {"message": "CampNode AI Service runs!"}


# Wir definieren strikt, welche Daten wir vom Node.js Backend erwarten
class AskRequest(BaseModel):
    course_id: str
    question: str

@app.post("/ask")
def ask_ai(request: AskRequest):
    """
    Dieser Endpunkt nimmt eine Frage entgegen und nutzt unser RAG-System für die Antwort.
    """
    # Wir rufen unsere fertige RAG-Funktion auf
    result = answer_question(request.course_id, request.question)
    
    # Das Ergebnis (Antwort + Quellen) wird automatisch als JSON zurückgeschickt
    return result


class IngestRequest(BaseModel):
    course_id: str
    title: str
    content: str

@app.post("/ingest")
def ingest_data(request: IngestRequest):
    """
    Dieser Endpunkt nimmt einen Kurs-Text entgegen und speichert ihn für die KI.
    """
    result = ingest_course_material(request.course_id, request.title, request.content)
    return result
