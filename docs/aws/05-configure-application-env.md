# AWS Setup 05 --- Configure the Application Environment

## Purpose

The production environment file lives on EC2, outside the source
repository:

``` text
/opt/glownscan/.env
```

Do not commit this file or copy secret values into documentation.

## Create the directory

``` bash
sudo install -d -o ubuntu -g ubuntu -m 700 /opt/glownscan
```

## Create or edit the file

``` bash
nano /opt/glownscan/.env
```

Add the environment variables required by the current application. At
minimum, verify the database URL variable expected by the application:

``` dotenv
GLOWNSCAN_DATABASE_URL=REPLACE_WITH_YOUR_DATABASE_CONNECTION_STRING
GLOWNSCAN_FIREBASE_PROJECT_ID=REPLACE_WITH_YOUR_FIREBASE_PROJECT_ID
```

These are placeholders, not working values. Use the real values from
your secure configuration source. The Firebase project ID is used to
verify Firebase ID tokens; the backend does not need a Firebase service
account private key for this verification flow. Configure the SMTP and
JWT values from `.env.example` as well. `DATABASE_URL` is a fallback in
the documented code path, but prefer the variable the application
explicitly expects.

Never paste the real `.env` contents into chat, tickets, shell
transcripts, or GitHub logs.

## Set correct ownership and permissions

The current deployment runs Docker commands as `ubuntu`, and the Docker
CLI needs to read the env file when `--env-file` is used. Therefore, for
this deployment model, keep the file owned by `ubuntu` with mode `600`:

``` bash
sudo chown ubuntu:ubuntu /opt/glownscan/.env
sudo chmod 600 /opt/glownscan/.env
ls -l /opt/glownscan/.env
```

Expected permission pattern:

``` text
-rw------- 1 ubuntu ubuntu ... /opt/glownscan/.env
```

Do not change it to `root:root` with mode `600` while the deployment CLI
runs as `ubuntu`; that causes `permission denied` when Docker reads
`--env-file`.

The parent directory should remain accessible to the deployment user and
restricted to that user, for example mode `700`.

## Verify without revealing secrets

Use:

``` bash
test -r /opt/glownscan/.env && echo "Environment file is readable"
stat -c '%U:%G %a %n' /opt/glownscan/.env
```

Do not use `cat`, `printenv`, or `docker inspect` in a way that outputs
secret values to logs.

## Database connectivity

The application checks database connectivity at startup and exposes
`/health/database`. After deployment, test the endpoint from EC2:

``` bash
curl -i http://127.0.0.1:3000/health/database
```

If it fails, check application logs, the database connection URL,
Supabase network access, TLS requirements, and credentials. Never
include the full connection string in an issue or workflow log.
