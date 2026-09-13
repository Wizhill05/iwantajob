FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# BACKEND_HOST/PORT are read by next.config.mjs rewrites; Next bakes rewrites
# into the build manifest, so they must be set at build time AND runtime.
ENV BACKEND_HOST=backend
ENV BACKEND_PORT=8999
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV BACKEND_HOST=backend
ENV BACKEND_PORT=8999
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
EXPOSE 3999
CMD ["npx", "next", "start", "-p", "3999"]
