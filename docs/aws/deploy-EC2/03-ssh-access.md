# AWS Setup 03 --- Secure SSH Administration

## Purpose

SSH is for administrator maintenance. GitHub Actions deployment should
use AWS Systems Manager (SSM), not SSH.

## Current connection details

-   SSH user: `ubuntu`
-   Instance public IP observed during setup: `52.65.25.65`
-   Private key was stored locally by the administrator. Do not put its
    path or contents into the repository.

Example command from Windows PowerShell:

``` powershell
ssh -o IdentitiesOnly=yes -i "C:\path\to\your-key.pem" ubuntu@YOUR_EC2_PUBLIC_IP
```

Replace the example path and IP with the real local key path and current
EC2 public IP.

## Private-key handling

-   Keep the `.pem` file outside the repository.
-   Never upload it to GitHub or paste it into an issue or chat.
-   Restrict local file permissions according to your operating system.
-   If the key is exposed, replace the access path and rotate
    credentials promptly.

## Security group restriction

The inbound SSH rule should allow port 22 only from the administrator's
current public IP in CIDR `/32` format, for example `203.0.113.10/32`
(documentation example only). Home and office IPs can change, so update
the rule when necessary.

Never use `0.0.0.0/0` for SSH as a convenience workaround.

## Troubleshooting

### Connection times out

-   Confirm the instance is running and status checks pass.
-   Confirm the public IP is current.
-   Confirm the security group permits port 22 from your current public
    IP.
-   Check subnet route table and network ACLs.
-   Confirm the correct private key and username are used.

### Permission denied (publickey)

-   Verify the key matches the EC2 key pair.
-   Use `ubuntu` for Ubuntu images.
-   Check that the local SSH command points to the correct key file.

## Prefer SSM for routine operations

SSM can run commands without requiring the SSH port to be open to
GitHub-hosted runners. See `07-iam-and-ssm.md`.
