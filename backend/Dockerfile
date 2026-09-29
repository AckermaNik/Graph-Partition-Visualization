# Use official Python runtime
FROM python:3.11-slim

# Set the working directory
WORKDIR /app

# Copy requirements and install them
# (We don't need a .venv in Docker because the container ITSELF is an isolated environment!)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Keep the backend as a Python package so relative imports work.
COPY . ./backend

# Expose FastAPI's default port
EXPOSE 8000

# Start the server
# CRITICAL: We MUST add --host 0.0.0.0 so FastAPI accepts connections from outside its container
CMD ["sh", "-c", "python -u -m uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
