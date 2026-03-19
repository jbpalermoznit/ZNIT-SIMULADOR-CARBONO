FROM node:20-slim

# Install Python
RUN apt-get update && apt-get install -y python3 python3-pip python3-venv && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python backend dependencies
COPY backend/requirements.txt backend/requirements.txt
RUN python3 -m pip install --break-system-packages -r backend/requirements.txt

# Install Node.js frontend dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy all source
COPY . .

# Build Next.js
RUN npm run build

# Environment
ENV BACKEND_URL=http://127.0.0.1:8000
ENV NEXT_PUBLIC_API_URL=

# Start both services — Next.js uses $PORT from Render
CMD bash -c "cd backend && python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000 & cd /app && sleep 2 && PORT=\${PORT:-3000} npm start"
