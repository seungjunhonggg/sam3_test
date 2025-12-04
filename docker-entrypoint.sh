#!/bin/bash
set -e

# Change to backend directory
cd /app/backend

# Run database migrations (if any)
python -c "import asyncio; from app.database import init_db; asyncio.run(init_db())"

# Start the server
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
