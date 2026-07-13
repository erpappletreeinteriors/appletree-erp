# syntax=docker/dockerfile:1

# ---- deps: install full workspace deps once, shared by build & prod stages ----
FROM node:20-alpine AS deps
WORKDIR /workspace
COPY package.json package-lock.json* ./
COPY apps/backend/package.json apps/backend/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN npm install --workspace=@appletree/backend --workspace=@appletree/shared-types --include-workspace-root

# ---- build: compile shared-types, generate prisma client, build nest app ----
FROM node:20-alpine AS build
WORKDIR /workspace
COPY --from=deps /workspace/node_modules ./node_modules
COPY package.json package-lock.json* ./
COPY packages/shared-types packages/shared-types
COPY apps/backend apps/backend
RUN npm run build --workspace=@appletree/shared-types
RUN npm run prisma:generate --workspace=@appletree/backend
RUN npm run build --workspace=@appletree/backend

# ---- production: minimal runtime image ----
FROM node:20-alpine AS production
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S appletree && adduser -S appletree -G appletree

COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/packages/shared-types/dist ./node_modules/@appletree/shared-types/dist
COPY --from=build /workspace/apps/backend/dist ./dist
COPY --from=build /workspace/apps/backend/generated ./generated
COPY --from=build /workspace/apps/backend/prisma ./prisma
COPY apps/backend/package.json ./package.json

USER appletree
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
