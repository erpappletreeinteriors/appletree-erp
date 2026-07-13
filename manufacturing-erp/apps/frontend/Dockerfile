# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /workspace
COPY package.json package-lock.json* ./
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN npm install --workspace=@appletree/frontend --workspace=@appletree/shared-types --include-workspace-root

FROM node:20-alpine AS build
ARG VITE_API_BASE_URL=http://localhost:3000
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
WORKDIR /workspace
COPY --from=deps /workspace/node_modules ./node_modules
COPY package.json package-lock.json* ./
COPY packages/shared-types packages/shared-types
COPY apps/frontend apps/frontend
RUN npm run build --workspace=@appletree/shared-types
RUN npm run build --workspace=@appletree/frontend

FROM nginx:1.27-alpine AS production
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/frontend/dist /usr/share/nginx/html
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:80/ >/dev/null 2>&1 || exit 1
