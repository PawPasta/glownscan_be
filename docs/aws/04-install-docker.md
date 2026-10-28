# AWS Setup 04 --- Install and Verify Docker

## Purpose

The EC2 host runs the GlownScan backend as a Docker container.

## Verify Docker

Connect to EC2 and run:

``` bash
sudo docker version
sudo docker ps
sudo docker run --rm hello-world
```

If `hello-world` prints its success message, Docker can run a basic
container.

## Docker group access

The `ubuntu` user was added to the Docker group during setup. After
changing group membership, reconnect to SSH before testing:

``` bash
groups
docker ps
```

If `docker ps` works without `sudo`, the current session has Docker
group access.

**Security note:** Membership in the `docker` group is effectively
root-level access to the host. Grant it only to trusted administrators
and deployment users.

## Verify the application container

``` bash
sudo docker ps --filter "name=glownscan-api"
```

Expected mapping:

``` text
127.0.0.1:3000->3000/tcp
```

The loopback binding is intentional: it prevents direct access to the
application port from outside the host.

## Useful commands

``` bash
# List running containers
sudo docker ps

# Show recent application logs
sudo docker logs --tail 200 glownscan-api

# Follow application logs
sudo docker logs -f glownscan-api

# Inspect the container configuration
sudo docker inspect glownscan-api

# List downloaded images
sudo docker images
```

Do not print environment variables or inspect output in a public issue
if it may reveal secrets.

## Image lifecycle

GitHub Actions publishes images to GHCR with the commit SHA as the tag.
The deployment pulls the image matching the workflow's commit. Avoid
deploying `latest` when immutable commit tags are available.
