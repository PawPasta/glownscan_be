# AWS Setup 12 --- Domain and HTTPS (Future Work)

## Current status

A domain has not yet been purchased. Public HTTP through Nginx is a
separate setup step and must be verified before proceeding. The current
application container binds to `127.0.0.1:3000`.

## Recommended end state

``` text
Frontend / API client
        |
        | HTTPS :443
        v
Domain DNS record
        |
        v
EC2 public IP or Elastic IP
        |
        v
Nginx + TLS certificate
        |
        | HTTP on loopback
        v
127.0.0.1:3000 --> glownscan-api
```

For example, a future API hostname could be `api.example.com`. This is
only an example; do not configure it until a domain is owned and DNS is
available.

## High-level steps

1.  Register a domain with a domain registrar.
2.  Choose whether to use the registrar's DNS or Amazon Route 53.
3.  Assign a stable public endpoint. Consider an Elastic IP for a single
    EC2 host.
4.  Create an `A` record for the API hostname pointing to that public
    IP.
5.  Confirm the DNS record resolves correctly.
6.  Install and configure Nginx with the real hostname.
7.  Obtain and configure a trusted TLS certificate, for example using
    Certbot and Let's Encrypt where supported.
8.  Permit inbound HTTPS port 443 in the EC2 security group.
9.  Redirect HTTP to HTTPS after TLS is verified.
10. Update frontend API base URLs and CORS settings.
11. Verify certificate renewal and monitor expiry.

## Security requirements

-   Do not send production credentials or authentication tokens over
    plain HTTP.
-   Do not expose port 3000 publicly.
-   Configure NestJS CORS for the actual frontend origins; do not use a
    permissive wildcard with credentials.
-   Consider secure cookie settings, trusted proxy behavior, rate
    limiting, and request size limits.
-   Keep TLS private keys readable only by the required system services.

## Alternative architecture

For a production service, consider moving public ingress to an
Application Load Balancer with HTTPS and a managed certificate. This can
be easier to scale and maintain, but adds AWS resources and cost. Choose
based on traffic, availability requirements, and budget.

## Before calling the system production-ready

-   HTTPS works and redirects are correct.
-   API hostname resolves reliably.
-   Frontend CORS and API URL are configured.
-   Health checks work through the public endpoint.
-   Secrets are stored securely and rotated.
-   Backups, monitoring, and rollback procedures are documented.
