FROM denoland/deno:latest

WORKDIR /app

# Copy shared code first (better layer caching)
COPY shared/ ./shared/

# Copy server code
COPY server/ ./server/

# Cache dependencies
RUN cd server && deno cache main.ts

WORKDIR /app/server

EXPOSE 3001

CMD ["deno", "run", "--allow-net", "--allow-env", "--allow-read", "main.ts"]
