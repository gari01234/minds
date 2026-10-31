FROM denoland/deno:2.5.6 AS deno
FROM node:24-bookworm-slim
COPY --from=deno /usr/bin/deno /usr/local/bin/deno
RUN apt-get update && apt-get install -y --no-install-recommends python3 ca-certificates && rm -rf /var/lib/apt/lists/*
ENV DENO_DIR=/opt/deno-cache DENO_NO_UPDATE_CHECK=1
COPY scripts/window-code-checks.mjs /opt/window-code-checks.mjs
COPY supabase/functions /opt/baseline/supabase/functions
WORKDIR /opt/baseline
RUN node /opt/window-code-checks.mjs --cache && chmod -R a+rX /opt/deno-cache
USER node
WORKDIR /tmp
