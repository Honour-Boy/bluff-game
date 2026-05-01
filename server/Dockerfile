FROM node:20-alpine

WORKDIR /app

# Install only production deps. The lockfile pins versions; use --omit=dev
# rather than --only=production for compatibility with newer npm.
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Document the default port — actual binding comes from process.env.PORT.
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider "http://localhost:${PORT:-3001}/health" || exit 1

CMD ["node", "index.js"]
