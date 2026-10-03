# syntax=docker/dockerfile:1
# One Dockerfile for everything:
#   target "dev"    - Node + compiled simulator; docker-compose runs the watch build in it
#   target "export" - the finished static website (CI: --output type=local,dest=dist)
#   target "web"    - self-contained nginx image serving the website

# --- CircuitJS1 (Falstad circuit simulator), compiled from source -----------
FROM docker.io/library/gradle:jdk8-ubi AS circuitjs
ARG CIRCUITJS_REPO=https://github.com/pfalstad/circuitjs1.git
# Pinned commit so builds are reproducible. Bump to update the simulator.
ARG CIRCUITJS_REF=5a707168778216bb6ed01bfdd62e8bbf7ae0a032
RUN microdnf install -y git && microdnf clean all
WORKDIR /src
RUN git init -q . \
 && git remote add origin "$CIRCUITJS_REPO" \
 && git fetch -q --depth 1 origin "$CIRCUITJS_REF" \
 && git checkout -q FETCH_HEAD
RUN gradle makeSite --console plain -q

# --- Node toolchain + simulator --------------------------------------------
FROM docker.io/library/node:22-alpine AS dev
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY --from=circuitjs /src/site /opt/circuitjs
ENV CIRCUITJS_DIR=/opt/circuitjs

# --- Static website -----------------------------------------------------------
FROM dev AS build
ARG BASE_PATH=/
ARG SITE_URL=http://localhost:8080/
COPY . .
RUN BASE_PATH="$BASE_PATH" SITE_URL="$SITE_URL" node scripts/build.mjs

FROM scratch AS export
COPY --from=build /app/dist /

FROM docker.io/library/nginx:1.29-alpine AS web
COPY docker/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
