import os
from dotenv import load_dotenv

# Lade die Umgebungsvariablen aus der .env Datei
load_dotenv()

# Hier holen wir die geheimen Keys aus der Umgebung und speichern sie in Variablen.
# Unser Python-Code kann dann einfach config.OPENAI_API_KEY verwenden.
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
