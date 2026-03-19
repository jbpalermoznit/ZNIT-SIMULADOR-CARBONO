#!/bin/bash

# Start FastAPI backend on port 8000 (internal, not exposed)
cd backend
uvicorn app.main:app --host 127.0.0.1 --port 8000 &
cd ..

# Wait for backend to be ready
sleep 3

# Start Next.js frontend on Render's $PORT (exposed)
PORT=${PORT:-3000} npm start
