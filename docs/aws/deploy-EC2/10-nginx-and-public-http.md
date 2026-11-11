# AWS Setup 10 --- Optional Nginx Reverse Proxy and Public HTTP

## Status

This is a follow-up step. The Docker container was confirmed running on
loopback, but do not assume Nginx has already been installed or
configured. Verify the server before applying this procedure.

## Why Nginx is needed

The container currently publishes:

``` text
127.0.0.1:3000:3000
```

This intentionally limits direct access to the EC2 host. Nginx can
listen on port 80 and proxy requests to `127.0.0.1:3000`.

Without a reverse proxy or another public ingress service, the public IP
will not directly reach the NestJS container on port 3000.

## Install Nginx

Connect to EC2 and run:

``` bash
sudo apt update
sudo apt install nginx -y
sudo systemctl enable --now nginx
sudo systemctl status nginx --no-pager
```

## Configure a default server

Create a site file:

``` bash
sudo nano /etc/nginx/sites-available/glownscan
```

Use:

``` nginx
server {
    listen 80;
    listen [::]:80;

    server_name _;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable it:

``` bash
sudo ln -s /etc/nginx/sites-available/glownscan /etc/nginx/sites-enabled/glownscan
sudo nginx -t
sudo systemctl reload nginx
```

If the symlink already exists, inspect it instead of creating a
duplicate. If the default Nginx site conflicts with this configuration,
review the enabled sites and disable the default only after confirming
it is not needed.

## Verify from the EC2 host

``` bash
curl -i http://127.0.0.1/
curl -i http://127.0.0.1/health/database
```

A `404` at `/` may be expected if NestJS does not define a root route.
Use the health endpoint to check the application.

## Verify from outside

After confirming the EC2 Security Group permits inbound HTTP port 80,
open:

``` text
http://YOUR_CURRENT_EC2_PUBLIC_IP/
http://YOUR_CURRENT_EC2_PUBLIC_IP/health/database
```

At the time these docs were written, the observed IP was `52.65.25.65`;
verify the current IP in the EC2 Console before using it.

## Important limitations

-   HTTP is not encrypted. Do not use this as the final production
    endpoint for logins, tokens, or sensitive user data.
-   Do not open port 3000 in the security group.
-   A public IP may change after stopping and starting the instance.
-   Configure HTTPS and a domain before production use; see
    `12-https-and-domain-later.md`.
