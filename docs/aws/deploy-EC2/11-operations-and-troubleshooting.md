# AWS Setup 11 --- Operations and Troubleshooting

## Verify deployment

Connect to EC2 or use the approved SSM session/command path.

``` bash
sudo docker ps --filter "name=glownscan-api"
sudo docker logs --tail 200 glownscan-api
curl -i http://127.0.0.1:3000/health/database
```

The container should be `Up` and bind `127.0.0.1:3000->3000/tcp`. The
health endpoint should return the success response defined by the
application.

## Check Nginx, if configured

``` bash
sudo nginx -t
sudo systemctl status nginx --no-pager
sudo journalctl -u nginx --since "30 minutes ago" --no-pager
```

## Check SSM

In AWS Systems Manager → Fleet Manager → Managed nodes, confirm the EC2
instance is Online.

From GitHub Actions, inspect: - `aws sts get-caller-identity` -
`aws ssm describe-instance-information` - SSM command ID - command
status - stdout and stderr from the command invocation

Never expose credentials or environment values in logs.

## Common failure: AWS region missing

Error:

``` text
Input required and not supplied: aws-region
```

Fix: ensure `AWS_REGION` exists under GitHub repository Variables if the
workflow uses `${{ vars.AWS_REGION }}`, or specify `ap-southeast-2`
directly in the workflow.

## Common failure: SSM access denied

-   Confirm `GlownScanGitHubSSMDeployPolicy` is attached to the GitHub
    Actions IAM user.
-   Confirm the region, account ID, instance ID, document ARN, and
    resource permissions.
-   Confirm the EC2 instance is registered with SSM.
-   Review the exact denied action in the workflow logs.

## Common failure: SSM instance not found or offline

-   Check the region.
-   Check `EC2_INSTANCE_ID`.
-   Check the EC2 role and `AmazonSSMManagedInstanceCore`.
-   Check SSM Agent status and outbound network connectivity.

## Common failure: GHCR pull denied

-   Confirm the image name and commit tag.
-   Confirm the package visibility and read permission.
-   Confirm the correct Docker user has registry authentication.
-   Do not print the token to debug the issue.

## Common failure: env-file permission denied

Error:

``` text
docker: --env-file: open /opt/glownscan/.env: permission denied
```

For the documented deployment model:

``` bash
sudo chown ubuntu:ubuntu /opt/glownscan/.env
sudo chmod 600 /opt/glownscan/.env
```

The deploy script must run Docker CLI as `ubuntu`. If you intentionally
change the deploy user, adjust the file ownership and Docker
authentication model accordingly.

## Common failure: port already allocated

Inspect current containers and listeners before stopping anything:

``` bash
sudo docker ps
sudo ss -ltnp
```

Do not stop unrelated services without identifying them.

## Common failure: database health check fails

``` bash
sudo docker logs --tail 200 glownscan-api
```

Check the database URL variable name, credentials, database
availability, TLS settings, and network access. Do not paste database
connection strings into logs or tickets.

## Rollback principles

If the workflow implements rollback, it should preserve the previous
image tag and restore it only if the new container fails its
startup/health check. Verify the exact workflow script before relying on
rollback. Avoid deleting old image tags until the deployment has been
stable.

## Incident response

If an AWS key, GHCR token, database password, or SSH private key is
exposed: 1. Revoke or rotate it. 2. Update the secure secret store. 3.
Confirm deployment still works. 4. Review CloudTrail and GitHub Actions
logs. 5. Remove the exposed value from repository history where
applicable.
