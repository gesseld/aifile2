FROM python:3.9-slim

RUN pip install spacy==3.7.0 flask && \
    python -m spacy download en_core_web_lg

WORKDIR /app
COPY ./backend/spacy_server.py .

EXPOSE 5000
CMD ["python", "spacy_server.py"]
