@echo off
cd /d %~dp0
call .venv\Scripts\activate
set PYTHONPATH=.
python -m app.mcp_server
pause
