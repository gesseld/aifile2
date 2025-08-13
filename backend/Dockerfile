FROM python:3.9-slim

WORKDIR /app

# Copy package files first
COPY requirements.txt .
COPY setup.py .

# Install dependencies (without the package yet)
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY ./app /app

# Install the package after copying the code
RUN pip install -e .

EXPOSE 8000

WORKDIR /app
ENV PYTHONPATH=/app
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]