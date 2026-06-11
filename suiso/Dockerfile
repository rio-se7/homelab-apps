# suiso — single image: Rust API server serving the built frontend statically.

FROM node:22-alpine AS frontend
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM rust:1.87-slim AS backend
WORKDIR /app
# Cache the dependency layer: build once against a dummy main.
COPY backend/Cargo.toml backend/Cargo.lock ./
RUN mkdir src && echo 'fn main() {}' > src/main.rs \
    && cargo build --release \
    && rm -rf src
COPY backend/src ./src
RUN touch src/main.rs && cargo build --release

FROM debian:bookworm-slim
RUN useradd --uid 10001 --user-group --no-create-home suiso
COPY --from=backend /app/target/release/suiso /usr/local/bin/suiso
COPY --from=frontend /app/dist /srv/static
USER 10001
ENV STATIC_DIR=/srv/static
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/suiso"]
