# nginx reverse proxy

Front the dashboard with nginx for a friendly URL, TLS, or basic IP allow-listing. Put the Next.js process on **loopback** (`127.0.0.1:3000`) and let nginx own **port 80/443** — see the systemd drop-in in [systemd/](systemd/). A copy-paste config lives in the repo as [`openclaw-dashboard.conf`](nginx/openclaw-dashboard.conf).

## Minimal HTTP config

Shipped example (also copy to `/etc/nginx/conf.d/openclaw-dashboard.conf`):

[`openclaw-dashboard.conf`](nginx/openclaw-dashboard.conf)

Inline equivalent — adjust `server_name` to your hostname or keep `_` for IP access:

```nginx
server {
  listen 80;
  server_name <dashboard-host>;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 300s;
    proxy_buffering off;
    proxy_request_buffering off;
  }
}
```

Reload:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## CentOS / RHEL stock `nginx.conf`

The default package often ships a **`server { … }` block still inside `/etc/nginx/nginx.conf`** (in addition to `include /etc/nginx/conf.d/*.conf;`). If both use `listen 80` and `server_name _`, nginx logs *conflicting server name* and one vhost is skipped. **Remove or comment out** the extra `server { … }` stanza in `/etc/nginx/nginx.conf` so only `conf.d/openclaw-dashboard.conf` handles port 80.

## TLS upgrade

Get a certificate (Let's Encrypt via certbot is the easy path):

```bash
sudo certbot --nginx -d <dashboard-host>
```

certbot rewrites the server block to listen on `443` with `ssl_certificate` lines. Once TLS is live, set `COOKIE_SECURE=true` in `apps/dashboard/.env.local` and restart the dashboard so session cookies are marked `Secure`.

## SELinux note (CentOS / RHEL / Rocky / Alma)

SELinux blocks nginx from making outbound TCP connections to localhost services unless you flip the boolean:

```bash
sudo setsebool -P httpd_can_network_connect 1
```

Without this, you'll see `(13: Permission denied) while connecting to upstream` in `/var/log/nginx/error.log` and 502s in the browser.

## Firewall

If `firewalld` is enabled:

```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

## Pairing with PM2 / systemd

This recipe is independent of how the dashboard process is supervised. Use it alongside [PM2](pm2.md), [systemd](systemd.md), or whatever else.

The bridge does **not** need an nginx proxy in single-host setups — it's already loopback-only and reached by the dashboard's server-side code, never by the browser.
