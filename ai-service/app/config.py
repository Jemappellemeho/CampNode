import os
from dotenv import load_dotenv

# Lade die Umgebungsvariablen aus der .env Datei
load_dotenv()

# KI-Provider (Uni self-hosted Mistral, OpenAI-kompatibler Endpoint).
# A1: Diese Namen spiegeln exakt docker-compose.yml / die Root-.env.example.
AI_API_KEY = os.getenv("AI_API_KEY")
AI_BASE_URL = os.getenv("AI_BASE_URL")
AI_CHAT_MODEL = os.getenv("AI_CHAT_MODEL", "mistral")
AI_EMBED_MODEL = os.getenv("AI_EMBED_MODEL", "nomic-embed-text")

# A4: Shared Secret. Das Node-Backend schickt diesen Wert im Header "X-Internal-Secret".
# Ist er gesetzt, weist der Service Anfragen ohne gültiges Secret mit 401 ab.
INTERNAL_AI_SECRET = os.getenv("INTERNAL_AI_SECRET")

# Supabase (pgvector) für die RAG-Embeddings.
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
