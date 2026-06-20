from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
from .rag import answer_question
from .ingest import ingest_course_material
from .config import INTERNAL_AI_SECRET


# Initialisiere unsere FastAPI Anwendung
app = FastAPI(title="CampNode AI Service")


# A4: Schützt /ask und /ingest mit einem Shared Secret.
# Das Node-Backend schickt den Header "X-Internal-Secret". Stimmt er nicht mit
# INTERNAL_AI_SECRET überein, wird die Anfrage mit 401 abgewiesen.
# Ist kein Secret konfiguriert (z.B. lokale Entwicklung), bleibt der Service offen,
# gibt aber beim Start eine Warnung aus.
def require_internal_secret(x_internal_secret: str | None = Header(default=None)):
    if not INTERNAL_AI_SECRET:
        # Kein Secret gesetzt -> Auth deaktiviert (nur für Dev gedacht).
        return
    if x_internal_secret != INTERNAL_AI_SECRET:
        raise HTTPException(status_code=401, detail="Invalid or missing internal secret")


if not INTERNAL_AI_SECRET:
    print("[WARN] INTERNAL_AI_SECRET is not set — /ask and /ingest are NOT protected. Set it in production!")


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
def ask_ai(request: AskRequest, x_internal_secret: str | None = Header(default=None)):
    """
    Dieser Endpunkt nimmt eine Frage entgegen und nutzt unser RAG-System für die Antwort.
    """
    require_internal_secret(x_internal_secret)

    # Wir rufen unsere fertige RAG-Funktion auf
    result = answer_question(request.course_id, request.question)

    # Das Ergebnis (Antwort + Quellen) wird automatisch als JSON zurückgeschickt
    return result


class IngestRequest(BaseModel):
    course_id: str
    title: str
    content: str

@app.post("/ingest")
def ingest_data(request: IngestRequest, x_internal_secret: str | None = Header(default=None)):
    """
    Dieser Endpunkt nimmt einen Kurs-Text entgegen und speichert ihn für die KI.
    """
    require_internal_secret(x_internal_secret)

    result = ingest_course_material(request.course_id, request.title, request.content)
    return result
