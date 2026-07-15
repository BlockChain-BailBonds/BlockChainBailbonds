FROM python:3.12-slim
WORKDIR /app
COPY backend ./backend
COPY index.html ./index.html
ENV PORT=7860 HOST=0.0.0.0 BAILBONDS_ALLOWED_ORIGIN=*
EXPOSE 7860
CMD ["python3", "backend/server.py"]
