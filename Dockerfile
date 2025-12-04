# SAM3 Labeling Tool - Docker Image
FROM nvidia/cuda:12.6.0-devel-ubuntu22.04

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3.12 \
    python3.12-venv \
    python3-pip \
    nodejs \
    npm \
    git \
    curl \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    && rm -rf /var/lib/apt/lists/*

# Set Python 3.12 as default
RUN update-alternatives --install /usr/bin/python python /usr/bin/python3.12 1
RUN update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.12 1

# Create app directory
WORKDIR /app

# Install Python dependencies
COPY backend/requirements.txt /app/backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Install PyTorch with CUDA support
RUN pip install torch==2.7.0 torchvision torchaudio --index-url https://download.pytorch.org/whl/cu126

# Clone and install SAM3
RUN git clone https://github.com/facebookresearch/sam3.git /app/sam3_repo && \
    cd /app/sam3_repo && \
    pip install -e .

# Copy backend code
COPY backend/ /app/backend/

# Install frontend dependencies and build
COPY frontend/package*.json /app/frontend/
WORKDIR /app/frontend
RUN npm install

COPY frontend/ /app/frontend/
RUN npm run build

# Go back to app root
WORKDIR /app

# Create data directories
RUN mkdir -p /app/data/uploads /app/data/projects /app/models/checkpoints /app/models/finetuned

# Expose ports
EXPOSE 8000

# Copy entrypoint script
COPY docker-entrypoint.sh /app/
RUN chmod +x /app/docker-entrypoint.sh

# Default command
CMD ["/app/docker-entrypoint.sh"]
