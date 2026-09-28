# sqlite-snapshot image

This image supplies `sqlite3` to the k3s backup initContainer. SQLite's
`.backup` creates a consistent snapshot before Fleet uploads it. The image
installs sqlite at build time, not during a scheduled backup, so runtime does
not require access to an Alpine package mirror. Fleet must use the verified
immutable GHCR image digest, never a mutable tag or `sha256:PENDING`.

## Platform and runtime contract

- Target platform: `linux/arm64` (the OCI ARM k3s node).
- The image runs as root intentionally: Fleet must access the root-owned k3s
  database and WAL path. Fleet overrides the entrypoint with `/bin/sh -c`.
- Snapshot creation requires no network access. The source database and
  snapshot destination are supplied by Fleet mounts; the image does not include
  rclone or credentials.

## Reproducibility boundary

The Alpine base is pinned by immutable OCI index digest. `apk add --no-cache sqlite`
resolves sqlite and its dependencies from Alpine v3.22 repositories at build
time; the sqlite package version is intentionally not hard-pinned in source.
Those repository indexes can change, so a later build from the same source is
**not** claimed to be bit-reproducible. Record the actual `sqlite3 -version`
output during validation. Deployed runtime immutability is provided by the
final published GHCR image digest, not by this Dockerfile alone.

## Validation contract

Build for `linux/arm64`, inspect the platform, entrypoint, user, and OCI labels,
and record the installed sqlite version. The build may access the pinned Alpine
base and Alpine v3.22 package repositories; package retrieval is not offline.
Runtime smoke tests instead use `--network none`, a read-only root filesystem,
and writable `/work` and `/tmp` tmpfs mounts. The basic test creates 1000
non-trivial rows and verifies a `.backup` snapshot. The WAL test requires a
non-empty WAL file before `.backup` and verifies the committed data in the
snapshot. Both require a snapshot larger than 8192 bytes, the expected rows,
and `PRAGMA integrity_check` to return exactly `ok`.

Local validation applies to the exact locally built image. A later workflow
build is a separate artifact and may have a different image ID because of
publication metadata, build environment, or Alpine package resolution. The
publishing workflow validates its own local image before pushing it. Neither
local smoke test establishes a live k3s backup or a restore drill.

## Publishing boundary

Only `.github/workflows/sqlite-snapshot.yml` publishes this image. After
separate Human Approval, manually dispatch it on `main` with the exact full
merged commit SHA in `expected_sha`. The workflow rejects a non-main ref or
SHA mismatch before checkout, then validates the same local image before
authenticating to GHCR with the repository `GITHUB_TOKEN` (`contents: read`,
`packages: write`). Its unique tag combines the source commit SHA, workflow
run ID, and run attempt. It supplies OCI revision/version metadata at build
time; no PAT or interactive login is needed.

The first GHCR publication is expected to be PRIVATE. Changing visibility to
PUBLIC requires separate Human Approval; only afterward can a credential-less
anonymous pull/inspect verify public availability. Read back and freeze the
published immutable digest before supplying it to Fleet. Never deliver Fleet
with `sha256:PENDING`.

The `rclone/rclone:1.68` digest is a separate Fleet Sub-delivery B concern.
Local image smoke testing is not live Level B backup evidence, and live cluster
validation is outside Sub-delivery A.
