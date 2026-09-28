# SQLite CLI for the k3s backup initContainer. Alpine packages are installed
# only at build time; the published image is consumed by immutable digest.
FROM alpine:3.22@sha256:5291449c3df73caf6ed85e649dec1b9e818b39a5d8c871e97afc13e9cd5e8fa8

LABEL org.opencontainers.image.source="https://github.com/rio-se7/homelab-apps" \
      org.opencontainers.image.title="sqlite-snapshot" \
      org.opencontainers.image.description="SQLite Online Backup tool for the k3s backup initContainer"

RUN apk add --no-cache sqlite

# Fleet mounts the root-owned k3s database; its command overrides this entrypoint.
ENTRYPOINT ["/bin/sh"]
