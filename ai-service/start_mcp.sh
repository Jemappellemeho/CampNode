#!/bin/bash
# Pfad zum Skript-Verzeichnis
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

# Virtuelle Umgebung aktivieren
source .venv/bin/activate

# PYTHONPATH setzen, damit die Module gefunden werden
export PYTHONPATH=$DIR

# Den MCP Server starten
python3 -m app.mcp_server
