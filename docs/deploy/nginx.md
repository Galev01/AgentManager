# nginx reverse proxy

Front the dashboard with nginx for a friendly URL, TLS, or basic IP allow-listing. The dashboard binds `127.0.0.1:3000` by default, so a reverse proxy on the same host is the standard setup.

## Minimal HTTP config

`/etc/nginx/conf.d/openclaw-dashboard.conf`:

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
  }
}
```

Reload:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

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
