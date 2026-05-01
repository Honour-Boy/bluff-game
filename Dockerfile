FROM node:20-alpine

WORKDIR /app

# Build context is the repo root (so the Dockerfile sits at the top
# level where Coolify expects it), but only the server tree ends up
# in the image. .dockerignore excludes the client tree to keep the
# build context small.
COPY server/package*.json ./
RUN npm ci --omit=dev

COPY server/ ./

# Document the default port — actual binding comes from process.env.PORT.
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider "http://localhost:${PORT:-3001}/health" || exit 1

CMD ["node", "index.js"]
