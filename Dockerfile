# syntax=docker/dockerfile:1

# --- Stage 1: build frontend (Vue/Vite) static bundle ---
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# --- Stage 2: backend runtime, serving the built frontend as static files ---
FROM node:20-alpine AS runtime
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY backend/ .
# backend/app.js resolves the frontend build as "../frontend/dist" relative
# to itself - the sibling layout must be preserved inside the image.
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

RUN mkdir -p uploads/downloads uploads/agent-releases && chown -R node:node /app
USER node

# migrate.js is idempotent (schema_migrations table tracks what's already
# applied, see backend/scripts/migrate.js) - safe to run on every container
# start, not just the first one.
CMD ["sh", "-c", "node scripts/migrate.js && node server.js"]
