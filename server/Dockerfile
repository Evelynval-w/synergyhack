# server/Dockerfile
#
# Node 20 alpine image for the Express API. Single-stage because
# there's no build step on the server (we run JS directly).
#
# Layout note: the repo's seed scripts live at <repo>/scripts/ and
# `require('../server/src/db/neo4j')` from inside them. We preserve
# that natural layout inside the container by working under
# /app/synergyhack/, with `server/` and `scripts/` as siblings:
#
#   /app/synergyhack/
#   ├── server/        (Express API, runs from here)
#   ├── scripts/       (seed scripts, run with `cd /app/synergyhack`)
#
# This keeps `../server/src/db/neo4j` resolving correctly without
# editing every seed script.

FROM node:20-alpine

WORKDIR /app/synergyhack

# Install server deps first (cached unless package files change).
# Sub-WORKDIR into server/ for the install so node_modules lands
# at /app/synergyhack/server/node_modules where the app expects it.
COPY server/package*.json ./server/
WORKDIR /app/synergyhack/server
RUN npm ci --omit=dev

# Copy the server source
WORKDIR /app/synergyhack
COPY server/ ./server/

# Copy the seed scripts and fixtures from repo root
COPY scripts/ ./scripts/

# Module resolution fix: seed scripts at /app/synergyhack/scripts/
# need to resolve `require('dotenv')` etc. Node's resolver walks up
# from the script's location looking for node_modules/, so we create
# a symlink at the project root pointing to server/node_modules.
# This is the same pattern Yarn workspaces use to share dependencies
# across packages without duplicating the install.
RUN ln -s server/node_modules node_modules

# Express listens on 3000 inside the container
EXPOSE 3000

# Default CWD is the server directory so `node src/index.js` works
WORKDIR /app/synergyhack/server
CMD ["node", "src/index.js"]
