#!/bin/bash
set -e

# Install Python backend dependencies
cd backend
pip install -r requirements.txt --quiet
cd ..

# Install and build Next.js frontend
npm install
npm run build
