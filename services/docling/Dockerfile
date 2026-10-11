# Private Docling Serve CPU runtime. Image and model stack version are pinned.
# Use a dedicated authenticated service; never serve MINDS files from GitHub.
FROM quay.io/docling-project/docling-serve-cpu:v1.36.0
ENV UVICORN_HOST=0.0.0.0 \
    UVICORN_PORT=5001 \
    DOCLING_SERVE_ENABLE_UI=false \
    DOCLING_SERVE_SHOW_VERSION_INFO=false \
    DOCLING_SERVE_ALLOW_EXTERNAL_PLUGINS=false \
    DOCLING_SERVE_ENABLE_REMOTE_SERVICES=false \
    DOCLING_SERVE_LOG_LEVEL=WARNING \
    DOCLING_SERVE_LOAD_MODELS_AT_BOOT=true \
    DOCLING_SERVE_MAX_FILE_SIZE=50331648 \
    DOCLING_SERVE_MAX_DOCUMENT_TIMEOUT=14400 \
    DOCLING_SERVE_ALLOWED_SOURCE_TYPES='["file"]' \
    DOCLING_SERVE_CORS_ORIGINS='[]' \
    DOCLING_SERVE_SINGLE_USE_RESULTS=false
# DOCLING_SERVE_API_KEY must be set in the hosting secret manager.
EXPOSE 5001
