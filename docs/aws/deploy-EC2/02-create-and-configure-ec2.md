# AWS Setup 02 --- Create and Configure EC2

## Current instance

-   Region: `ap-southeast-2` (Sydney)
-   Instance ID: `i-009ee9f9e537e232b`
-   OS: Ubuntu 24.04
-   SSH login user: `ubuntu`
-   Public IPv4 observed during setup: `52.65.25.65`
-   Private IPv4 observed during setup: `172.31.37.155`

## Verify the instance

1.  Open the [EC2
    Console](https://ap-southeast-2.console.aws.amazon.com/ec2/home?region=ap-southeast-2#Instances:).
2.  Select the region `Asia Pacific (Sydney) ap-southeast-2`.
3.  Search for the instance ID.
4.  Confirm the instance is running and its status checks pass.
5.  Record its current public and private IP addresses.

Do not assume the recorded public IP is permanent. If the instance is
stopped and started, the public IP can change unless an Elastic IP is
associated.

## Security group

The security group used during setup is `sg-032d23d7e99080672`. Verify
the actual security group attached to the instance before editing rules.

Expected inbound rules:

  Type      Port Source                               Purpose
  ------- ------ ------------------------------------ --------------------------------------
  SSH         22 Administrator public IP `/32` only   Server maintenance
  HTTP        80 `0.0.0.0/0`                          Public HTTP via Nginx, if configured
  HTTPS      443 `0.0.0.0/0`                          HTTPS after TLS is configured

IPv6 rules should be added only if IPv6 is intentionally configured. Do
not open SSH to `0.0.0.0/0`.

Port `3000` should not be open in the security group. Docker currently
binds the application to `127.0.0.1:3000`, so a reverse proxy can be
placed in front of it.

## Configure or update inbound rules

1.  Open EC2 → Security Groups.
2.  Select the security group attached to the instance.
3.  Open **Inbound rules** → **Edit inbound rules**.
4.  Add or update only the required rules.
5.  Save changes and review the rules again.

## Outbound connectivity

The instance needs outbound connectivity to pull container images and
reach its database. The exact network setup may use the default outbound
rule, a NAT path, or VPC endpoints. Do not remove outbound access
without verifying that GHCR, SSM, and the database remain reachable.

## Optional: Elastic IP

If a stable public IP is required before buying a domain, allocate an
Elastic IP in `ap-southeast-2` and associate it with the instance. Check
AWS pricing and release unused Elastic IPs to avoid unnecessary charges.

## Verification

From the EC2 Console, confirm the instance is running and status checks
pass. From an administrator machine, verify SSH using the procedure in
`03-ssh-access.md`.
