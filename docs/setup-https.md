# Local HTTPS / WSS Setup

The backend is designed to run behind a Caddy reverse proxy that terminates TLS for both HTTPS and WebSocket traffic. Follow these steps to configure a functional development environment.

## 1. Hostname Resolution

1. Add the following entry to `/etc/hosts` (macOS/Linux) or `C:\Windows\System32\drivers\etc\hosts` (Windows):
   ```
   127.0.0.1 http://localhost:3000
   ```
2. Flush your DNS cache if required (`sudo dscacheutil -flushcache` on macOS).

## 2. Environment Variables

Ensure `.env` contains the correct proxy values:

```
PUBLIC_DOMAIN=http://localhost:3000
CADDY_ADMIN_EMAIL=you@example.com
```

## 3. Certificates

Caddy automatically issues local certificates via its built-in CA when `PUBLIC_DOMAIN` resolves to `127.0.0.1`. No manual certificate generation is required.

## 4. Docker Compose Lifecycle

Start the stack (rebuild images if dependencies changed):

```sh
docker compose -f docker/compose.yml up --build
```

Run detached once configuration is stable:

```sh
docker compose -f docker/compose.yml up -d
```

Stop containers (keep volumes):

```sh
docker compose -f docker/compose.yml down
```

Remove containers **and** the SQLite volume for a clean reset:

```sh
docker compose -f docker/compose.yml down --volumes
```

Services started by the stack:

- `proxy` – Caddy with automatic HTTPS certificates and HTTP→HTTPS redirects.
- `api` – Fastify application container listening on port `3000`.
- `sqlite` – Utility container exposing the shared SQLite volume.

## 5. Database Migration

After containers are running, exec into the API container to apply migrations (if not run locally):

```sh
docker compose -f docker/compose.yml exec api npm run migrate:up
```

## 6. Validation Steps

1. Visit `http://localhost:3000/docs` to ensure TLS negotiation completes and documentation renders.
2. Download the specification from `http://localhost:3000/openapi.yaml` and confirm it matches the repository bundle.
3. Open a WebSocket client (e.g., devtools or `wscat`) to `wss://http://localhost:3000/ws/chat/test` and confirm the connection is accepted.
4. Check Caddy logs for any TLS warnings or renewals.

## 7. Troubleshooting

- **Certificate trust issues**: Import Caddy’s local CA from `~/.local/share/caddy/pki/authorities/local/` into your system trust store.  
- **Port conflicts**: Ensure ports `80` and `443` are free before running Compose.  
- **Proxy configuration changes**: Edit `docker/proxy/Caddyfile` and restart the stack (`docker compose down && docker compose up --build`).
