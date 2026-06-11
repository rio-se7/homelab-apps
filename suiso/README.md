# 水槽 suiso — k3s aquarium

Renders the live k3s cluster as a deep-sea aquarium. Every pod is a fish:

| Cluster state | In the tank |
|---|---|
| Running pod | Fish swimming with its namespace school |
| Memory usage | Fish size (log scale, via metrics-server) |
| CPU usage | Swim speed |
| Namespace | School color + label, grouped together |
| Pending pod | Drifting egg |
| CrashLoopBackOff / Failed | Belly-up fish sinking to the floor (with `!`) |
| Succeeded (Job) | Ghost jellyfish rising to the surface |
| Container restart | Flash ring + bubble burst |
| Pod deleted / terminating | Fish fades away |
| k8s Events | News ticker at the bottom (Warning in amber) |

Click a fish for pod details. Hover/click a namespace in the legend to
highlight its school.

## Architecture

```
k8s API (pods/events watch + metrics.k8s.io poll)
   │  in-cluster ServiceAccount, read-only ClusterRole
   ▼
backend (Rust / axum)  ──  GET /api/state   snapshot JSON
   │ normalizes to a small   GET /api/stream  SSE (sync → deltas)
   │ Pod/Event model         GET /healthz /readyz
   ▼
frontend (React + Canvas 2D, zero runtime deps beyond React)
```

- Single container: axum serves the built frontend from `STATIC_DIR`.
- `/readyz` returns 503 until the first successful pod list (real readiness).
- metrics-server is optional — without it fish keep default sizes.
- No database, no external services; state is rebuilt from the API on start.

## Local development

```bash
# Terminal 1 — backend with a generated mock cluster (no kubeconfig needed)
cd backend && SUISO_MOCK=1 cargo run

# Terminal 2 — frontend with hot reload (proxies /api to :8080)
cd frontend && npm install && npm run dev
```

Or serve the built frontend straight from the backend:

```bash
cd frontend && npm run build
cd ../backend && SUISO_MOCK=1 STATIC_DIR=../frontend/dist cargo run
```

## Deployment

Deployed via `homelab-fleet/infra/suiso/` (ArgoCD):

- ServiceAccount + ClusterRole: `get/list/watch` on pods, events, namespaces,
  nodes + `get/list` on `metrics.k8s.io` — read-only by design.
- Image is built by `.github/workflows/suiso.yml` (ARC runner) and pushed to
  `ghcr.io/rio-se7/suiso:<commit-sha>`; fleet pins that SHA.

> **First-deploy note:** ghcr packages default to *private* on first push.
> Make `ghcr.io/rio-se7/suiso` public (package settings) or the cluster will
> get `ImagePullBackOff` — same as was done for the dobutsu-analyzer images.

External exposure follows the standard pattern: add a `suiso` entry to
`internal_apps` in `homelab-infra/cloudflare/locals.tf`
(subdomain `suiso`, service = Traefik) and Cloudflare DNS / Access / tunnel
ingress are generated automatically.
