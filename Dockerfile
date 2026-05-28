FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5000

CMD ["uwsgi", "--http", "0.0.0.0:5000", "--wsgi-file", "app.py", "--callable", "app", "--processes", "2", "--threads", "4"]
