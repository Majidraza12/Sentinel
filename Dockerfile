# Single image for the whole app: builds the React frontend, then serves it
# and the inference API from one FastAPI process.
#   docker build -t sentinel .
#   docker run -p 7860:7860 sentinel      ->  http://localhost:7860

# ---- 1. frontend --------------------------------------------------------
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ---- 2. runtime ---------------------------------------------------------
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app

RUN pip install torch==2.7.1 torchvision==0.22.1 --index-url https://download.pytorch.org/whl/cpu
COPY requirements-server.txt ./
RUN pip install -r requirements-server.txt

COPY src/ src/
COPY server/ server/
COPY outputs/checkpoints/ outputs/checkpoints/
COPY outputs/metrics/ outputs/metrics/
COPY outputs/predictions/ outputs/predictions/
COPY data/splits/ data/splits/
COPY --from=web /web/dist web/dist

# Hugging Face Spaces / Render / Fly all inject $PORT; 7860 is the HF default.
ENV PORT=7860
EXPOSE 7860
RUN useradd --create-home app && chown -R app /app
USER app
CMD ["sh", "-c", "uvicorn server.main:app --host 0.0.0.0 --port ${PORT}"]
