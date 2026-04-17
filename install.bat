cd frontend
call npm install three @types/three @react-three/fiber @react-three/drei axios @react-three/postprocessing gsap
cd ..
cd backend
python -m venv venv
call .\venv\Scripts\activate.bat
pip install -r requirements.txt
