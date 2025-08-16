FROM python:3.9-slim

WORKDIR /app

COPY proxy_main_secure.py .

RUN pip install --no-cache-dir fastapi uvicorn httpx asyncpg

EXPOSE 8000

CMD ["uvicorn", "proxy_main_secure:app", "--host", "0.0.0.0", "--port", "8000"]
