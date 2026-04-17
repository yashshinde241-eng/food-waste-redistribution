@echo off
cd backend
call .\venv\Scripts\activate.bat
pip install -r requirements.txt
pip install pytest
pytest test_algorithms.py
pause
