FROM node:22-alpine AS frontend
WORKDIR /project
COPY frontend/ ./frontend/
RUN cd frontend && npm install --no-audit --no-fund && npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt && useradd --system --home-dir /srv qrcall
COPY app ./app
COPY --from=frontend /project/app/static/caller.bundle.js ./app/static/caller.bundle.js
USER qrcall
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2", "--no-access-log", "--proxy-headers", "--forwarded-allow-ips", "*"]
