# Production Deployment (iwantajob-prod)

Permanent Dockerized instance, fully isolated from local dev (bun, ports 3020/8020,
legacy DB). Public URL: **https://iwantajob.aryansingh.space**

## Architecture

```
cloudflared (dedicated tunnel "iwantajob-prod")
   └─> frontend  (Next.js, 127.0.0.1:3999)  ──/api proxy──>  backend (FastAPI, 127.0.0.1:8999)
                                                                └─> db (postgres:16, fresh volume, no host port)
```

- The database is a **fresh, containerized Postgres** (`iwantajob_prod` in the
  `pgdata_prod` volume). It is never published to the host, so the legacy
  Postgres on localhost:5432 is untouched. Tables are auto-created by the
  backend's `init_db()` on first boot.
- Data **persists across updates** (the volume is never deleted).

## First-time setup (done once)

1. `cloudflared tunnel login` (interactive, one time)
2. Create the tunnel and capture the ID:
   ```bash
   cloudflared tunnel create iwantajob-prod
   cp ~/.cloudflared/<TUNNEL_ID>.json cloudflared/credentials.json
   chmod 644 cloudflared/credentials.json   # container runs as non-root
   sed -i "s/TUNNEL_ID_PLACEHOLDER/<TUNNEL_ID>/" cloudflared/config.yml
   echo "TUNNEL_ID=<TUNNEL_ID>" >> .env   # replace the empty line
   ```
   Note: the compose `cloudflared` command must `run <TUNNEL_ID>` (the UUID,
   not the name) — resolving the name requires the origin cert, which the
   container doesn't have.
3. Point DNS at it (proxied CNAME):
   ```bash
   source ~/.bashrc && flarectl dns create-or-update \
     --zone aryansingh.space \
     --name iwantajob.aryansingh.space \
     --type CNAME \
     --content <TUNNEL_ID>.cfargotunnel.com \
     --proxy=true
   ```
4. Start everything: `docker compose up -d`

## Deploying an update (every time code changes)

```bash
docker compose build && docker compose up -d
```

Rebuilds the images from current code and recreates the containers. The
database volume survives. Code changes in the repo never affect prod until
you run this.

## Operations

```bash
docker compose ps                        # status
docker compose logs -f backend           # logs (also: frontend, db, cloudflared)
docker compose down                      # stop (data kept)
docker compose down -v                   # stop + WIPE the production database
curl http://127.0.0.1:8999/health        # direct backend health (VPS only)
```

## Secrets / config

- `.env` (gitignored) holds `POSTGRES_PASSWORD`, `TUNNEL_ID`, plus the shared
  `FREEAPI_*` / `INDEED_*` keys. The backend gets these via `env_file`; only
  `DATABASE_URL` is overridden in `docker-compose.yml` to target the fresh DB.
- `cloudflared/credentials.json` (gitignored) is the tunnel credential.
- `cloudflared/config.yml` is committed but contains only the tunnel ID and
  ingress rules — no secrets.
