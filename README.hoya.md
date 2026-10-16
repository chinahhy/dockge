# Dockge — Hoya's fork

This fork addresses the reconnect loop reported in
[louislam/dockge#1008](https://github.com/louislam/dockge/issues/1008).
The frontend connects with WebSocket first and automatically tries HTTP
long-polling if WebSocket is unavailable. Authentication and the server's Origin
checks are unchanged. The underlying trigger of the original polling failure
has not been conclusively identified.

The change is in `frontend/src/socket-connection.ts`, used by the normal frontend
socket mixin. Assets are built from source, including gzip/Brotli files and Vite's
content-hashed filenames; no runtime bundle patch is needed.

## Docker image

```text
hoya0803/dockge:latest
```

The release workflow builds Linux amd64 and arm64 images. OCI labels record the
source repository and exact commit. The rest of the Docker image is built using
the upstream Dockerfile and this fork's source and lockfile.

For an existing deployment, retain its ports, data and stacks mounts, and
environment settings. Change the image reference and remove any old
`dockge-websocket-first.cjs` startup override before recreating the service.
Keep the previous image digest for rollback. Do not delete the data directory.

## Validation and publishing

`npm ci --ignore-scripts`, `npm run lint`, `npm run check-ts`,
`npm run test:socket`, and `npm run build:frontend` validate the source.
Socket tests exercise real WebSocket connections, polling-only fallback, and
event delivery after a transport loss.

GitHub CI also builds the actual image and tests its frontend in Chromium:
initial setup/login, repeated reloads, a new tab, logout/fresh login, and a
65-second heartbeat observation. Screenshots and redacted results are retained
as short-lived Actions artifacts. Test credentials exist only in the disposable
runner environment and are not printed or uploaded.

To publish, add `DOCKERHUB_TOKEN` to this fork's Actions secrets, then run
**Publish Hoya Docker Hub image** on `master`. The token must permit image pushes
for Docker Hub account `hoya0803`. Never commit credentials. Publishing runs the
validation workflow first; `latest` is pushed only after it passes.

The inherited upstream nightly publisher is disabled for forks. This repository
does not publish to upstream image names.

Upstream documentation and the MIT license are retained in `README.md` and
`LICENSE`.
