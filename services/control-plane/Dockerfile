FROM python:3.13-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN addgroup --system skein && adduser --system --ingroup skein --uid 10001 skein
WORKDIR /app
COPY pyproject.toml ./
COPY skein ./skein
RUN pip install --no-cache-dir .
USER 10001:10001
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=2s --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=1)"]
CMD ["uvicorn", "skein.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-server-header"]
