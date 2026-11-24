# Deployment Examples

Reference configurations for common production deployment scenarios. Each example is a single, self-contained file with a header comment explaining when to use it.

Pick an example based on your needs:

| What you want | Use this file |
|---------------|---------------|
| Automatic TLS without manually configuring certificates | `docker-compose.caddy.yml` or `docker-compose.https-portal.yml` |
| Automatic TLS with a dashboard (Traefik) | `docker-compose.traefik.yml` |
| Expose without opening ports (zero-trust) | `docker-compose.cloudflare-tunnel.yml` |
| You already use Nginx + Certbot | `docker-compose.nginx.yml` |
| PostgreSQL backup job | `docker-compose.with-backup.yml` |
| Running on Kubernetes cluster | `kubernetes.yaml` |

**Note:** These are reference configs, not a supported matrix. Adapt them to your infrastructure and security requirements. The root `docker-compose.yml` stays simple for quick starts.

## File-by-file breakdown

### `docker-compose.caddy.yml`
**Scenario:** Put LinkBreeze behind Caddy with automatic HTTPS (Let's Encrypt handled automatically by Caddy). Caddy fetches and renews certificates for you — no Certbot or manual TLS configuration.

**When to use:** You want a reverse proxy with minimal config and automatic TLS, but you don't need Traefik's dashboard or mesh features.

**Required:**
- A domain pointed to your server (A record)
- Ports 80 and 443 open on your firewall

**Env vars:** Same as root `docker-compose.yml` (no extra vars)

**Ports:** 80 (HTTP), 443 (HTTPS) — Caddy handles TLS, proxies to `localhost:3000`

### `docker-compose.traefik.yml`
**Scenario:** Put LinkBreeze behind Traefik with automatic TLS via Let's Encrypt. Traefik provides a dashboard for monitoring routes and certificates.

**When to use:** You're already using Traefik in your stack, or you want a reverse proxy with a built-in dashboard and automatic service discovery.

**Required:**
- A domain pointed to your server
- Ports 80 and 443 open
- Traefik acme.json volume (certificate storage)

**Env vars:**
- `CLOUDFLARE_EMAIL` (if using Cloudflare DNS challenge for wildcard certs)
- `CLOUDFLARE_API_TOKEN` (if using Cloudflare DNS challenge)

**Ports:** 80, 443, plus Traefik dashboard (8080, adjust to taste)

### `docker-compose.cloudflare-tunnel.yml`
**Scenario:** Expose LinkBreeze via Cloudflare Tunnel (no open ports, zero-trust). Cloudflare's edge terminates TLS and proxies to your container over their encrypted tunnel.

**When to use:** Your server is behind NAT, you don't want to open ports, or you want Cloudflare's DDoS protection and caching in front of LinkBreeze.

**Required:**
- A Cloudflare account
- A domain on Cloudflare
- A Cloudflare Tunnel created and configured (cloudflared token)

**Env vars:**
- `TUNNEL_TOKEN` — your Cloudflare tunnel token (from Cloudflare Zero Trust dashboard)

**Ports:** None (tunnel is outbound-only). LinkBreeze stays on localhost:3000.

### `docker-compose.nginx.yml`
**Scenario:** Put LinkBreeze behind Nginx reverse proxy with Certbot for TLS. Manual certificate management via Certbot's webroot challenge.

**When to use:** You already have Nginx running on your server and want to integrate LinkBreeze into your existing web stack.

**Required:**
- A domain pointed to your server
- Ports 80 and 443 open
- Certbot installed and configured

**Env vars:** None extra (uses same env as root compose)

**Ports:** 80, 443 — Nginx handles TLS and proxies to `localhost:3000`

### `docker-compose.https-portal.yml`
**Scenario:** Use https-portal for one-line TLS. A sidecar container automatically fetches Let's Encrypt certificates for any domain in its config.

**When to use:** You want automatic TLS without a full reverse proxy setup, or you have multiple services that need HTTPS and want a single certificate manager.

**Required:**
- A domain pointed to your server
- Ports 80 and 443 open

**Env vars:**
- `DOMAINS` — space-separated list of domains (e.g., `links.example.com,www.links.example.com`)

**Ports:** 80, 443 — https-portal terminates TLS and proxies to `localhost:3000`

### `docker-compose.with-backup.yml`

Use this overlay with the root Compose file. It runs one PostgreSQL dump and one app-volume archive into the backup volume. Schedule the command from the host. For consistent database and file backups, pause app writes during the backup.

```sh
docker compose -f docker-compose.yml -f examples/docker-compose.with-backup.yml run --rm backup
```

See the [restore and upgrade guide](../docs/dokploy.md).

### `kubernetes.yaml`
**Scenario:** Run LinkBreeze on Kubernetes cluster with Deployment, Service, and Ingress. Includes HPA (Horizontal Pod Autoscaler) and resource limits.

**When to use:** You're deploying to a Kubernetes cluster and need LinkBreeze as part of your workloads.

**Required:**
- A Kubernetes cluster
- An Ingress controller (nginx-ingress, Traefik, etc.)
- PVC (PersistentVolumeClaim) for app files and a PostgreSQL connection URL

**Env vars:** Same as root compose (passed via ConfigMap/Secret)

**Ports:** 3000 (container), exposed via Service, routed via Ingress

## Common patterns across examples

All examples share these conventions:

- **Data persistence:** A named volume (`linkbreeze-data`) is mounted at `/app/data`. This contains uploads, local exports, and the signing key. The database has separate storage. Never omit the volume unless you want to lose data on container restart.
- **Env vars:** Required vars are explicitly listed in each file's header. Missing vars fall back to sensible defaults where possible.
- **Restart policy:** `unless-stopped` is used across all examples — the container restarts on crashes and reboots.
- **Health checks:** Where applicable, a simple healthcheck is included (HTTP GET to `/api/health`).
- **Secret management:** Examples show inline env vars for clarity. In production, use Docker secrets, Kubernetes secrets, or an external vault.

## Security considerations

- **SECRET_KEY:** Always set a strong random value. Generate with `openssl rand -hex 32`. Don't use the default.
- **TLS:** Never expose LinkBreeze directly on port 80 in production. Always use HTTPS. All examples show how to terminate TLS.
- **Backups:** If your data matters, schedule backups. The `with-backup.yml` example shows how.
- **Updates:** Monitor the GitHub releases for updates. Pull the latest image (`docker compose pull && docker compose up -d`) regularly.

## Adapting examples to your stack

These examples are starting points, not rigid templates. You can mix and match:
- Add a backup sidecar to any example by copying the relevant sections from `docker-compose.with-backup.yml`
- Swap the reverse proxy in `caddy.yml` or `nginx.yml` for your preferred tool
- Use Cloudflare Tunnel with Kubernetes via a sidecar or DaemonSet

The goal is to reduce the time from "clone" to "production" by providing battle-tested patterns.