@echo off
start cmd /k "cd backend && call .\venv\Scripts\activate.bat && uvicorn main:app --reload --port 8000"
start cmd /k "cd frontend && npm run dev"
