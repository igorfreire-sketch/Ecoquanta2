FROM python:3.12-slim-trixie
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openjdk-21-jre-headless && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py mpp_converter.py ./
RUN useradd --system --uid 10001 appuser && chown -R appuser:appuser /app
USER appuser
ENV PORT=8080
CMD ["sh", "-c", "exec gunicorn --bind 0.0.0.0:${PORT} --workers 1 --threads 2 --timeout 900 app:app"]
