@echo off
title SkillGraph Launcher
echo ========================================================
echo   Launching SkillGraph Enterprise Workspace...
echo ========================================================
echo.
echo Starting FastAPI Backend on http://127.0.0.1:8000 ...
start "SkillGraph Backend" /min cmd /c "python -m uvicorn backend.api:app --host 127.0.0.1 --port 8000"
echo.
echo Opening browser to http://127.0.0.1:3000 ...
start http://127.0.0.1:3000
echo.
echo Starting Vite Frontend on http://127.0.0.1:3000 ...
npm run dev
pause
