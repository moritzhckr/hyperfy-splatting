# Deployment

## Self-hosting a server

### 1. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

| Variable | Description |
|---|---|
| `JWT_SECRET` | Secret key for signing auth tokens (16+ chars recommended) |
| `ADMIN_CODE` | Password for admin operations (backup, restore) |
| `PORT` | HTTP port (default: `3000`) |
| `PUBLIC_WS_URL` | Public WebSocket URL, e.g. `wss://your-server.com/ws` |
| `PUBLIC_API_URL` | Public API URL, e.g. `https://your-server.com` |
| `ASSETS_BASE_URL` | Base URL for serving uploaded assets |
| `CORS_ORIGIN` | Allowed CORS origin (default: `*`) |

### 2. Build and start

```bash
npm run build
npm start
```

The server listens on `PORT` (default 3000). Visit `http://localhost:3000` to confirm it's running.

### Docker

```bash
docker run -d \
  --name hyperfy \
  -p 3000:3000 \
  -v $(pwd)/world:/app/world \
  --env-file .env \
  ghcr.io/hyperfy-xyz/hyperfy:latest
```

See [DOCKER.md](../DOCKER.md) for full details.

### Reverse proxy (nginx / Caddy)

Hyperfy uses WebSockets, so your proxy must forward upgrade headers.

**nginx snippet:**
```nginx
location / {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```

**Caddyfile snippet:**
```
your-server.com {
    reverse_proxy localhost:3000
}
```

---

## Connecting the GitHub Pages preview to a server

The static build deployed to GitHub Pages boots in **offline mode** by default (no server required). There are two ways to point it at a real server.

### Option 1 — Bake in a default server URL

Edit `.github/workflows/static-deploy.yml` and add an `env` block to the build step:

```yaml
- run: npm run static:build
  env:
    PUBLIC_WS_URL: ''  # wss://your-server.com/ws
```

Replace the empty string with your WebSocket URL, push to `dev`, and the next deploy will bake it in. Setting it back to `''` (or removing the line) returns to offline mode.

### Option 2 — Per-link override

Share URLs with a `?connect=` query parameter:

```
https://your-org.github.io/hyperfy/?connect=wss://your-server.com/ws
```

This works without any build changes — visitors are connected to your server for that session only.
