# client/Dockerfile
#
# Multi-stage build:
#   Stage 1 (build):   Node 20 alpine compiles the React app via Vite
#   Stage 2 (runtime): Nginx alpine serves the static dist + proxies /api
#
# The runtime image has no Node, no npm, just Nginx + the built assets.
# Final image size is around 50 MB instead of 1+ GB.

# ---------- Stage 1: build ----------
FROM node:20-alpine AS build

WORKDIR /app

# Install dependencies (cached unless package files change)
COPY package*.json ./
RUN npm ci || npm install

# Copy source and build. Vite outputs to /app/dist
COPY . .
RUN npm run build

# ---------- Stage 2: runtime ----------
FROM nginx:1.27-alpine

# Replace the default site with our config (proxies /api to the
# server container, serves the SPA with history-mode fallback).
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the built assets from the build stage
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
