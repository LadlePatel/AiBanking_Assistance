# Use an official Python runtime as a parent image
FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# Set the working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    curl \
    gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Copy the requirements file into the container
COPY api/requirements.pinned.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.pinned.txt

# Copy the application code
COPY api/ ./api/
COPY banking_mcp/ ./banking_mcp/

# Ensure uploads directory exists
RUN mkdir -p /app/api/uploads

# Expose the port the app runs on
EXPOSE 5000

# Command to run the application (from project root to support relative paths in mcp_config.json)
CMD ["python3", "api/main.py"]
