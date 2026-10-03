# CircuitJS1 (Falstad circuit simulator) built from source and served by nginx.
# Stage 1: compile the GWT app (Java -> JavaScript). Takes a few minutes the first time.
FROM docker.io/library/gradle:jdk8-ubi AS build
ARG CIRCUITJS_REPO=https://github.com/pfalstad/circuitjs1.git
# Pinned commit so rebuilds are reproducible. Bump to update.
ARG CIRCUITJS_REF=5a707168778216bb6ed01bfdd62e8bbf7ae0a032
RUN microdnf install -y git && microdnf clean all
WORKDIR /src
RUN git init -q . \
 && git remote add origin "$CIRCUITJS_REPO" \
 && git fetch -q --depth 1 origin "$CIRCUITJS_REF" \
 && git checkout -q FETCH_HEAD
RUN gradle makeSite --console plain -q

# Stage 2: tiny static web server.
FROM docker.io/library/nginx:1.29-alpine
COPY --from=build /src/site /usr/share/nginx/html
# Keep the stock example list so it can be merged with our own menu at startup.
RUN cp /usr/share/nginx/html/circuitjs1/setuplist.txt /usr/share/nginx/html/circuitjs1/setuplist.orig.txt
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY 40-kids-menu.sh /docker-entrypoint.d/40-kids-menu.sh
RUN chmod +x /docker-entrypoint.d/40-kids-menu.sh
