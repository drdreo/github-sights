FROM denoland/deno:2.2.2

WORKDIR /app

# Copy shared code first (better layer caching)
COPY shared/ ./shared/

# Copy crawler code
COPY crawler/ ./crawler/

# Cache dependencies
RUN cd crawler && deno cache main.ts

WORKDIR /app/crawler

CMD ["deno", "run", "--allow-net", "--allow-env", "--allow-read", "main.ts"]
