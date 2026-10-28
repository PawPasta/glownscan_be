# AWS Setup 07 --- IAM Roles, IAM User, and Systems Manager

## Purpose

SSM is the remote command channel used by GitHub Actions to deploy to
EC2. This avoids needing GitHub-hosted runners to connect to SSH port
22.

## Resources in this setup

-   Region: `ap-southeast-2`
-   EC2 instance: `i-009ee9f9e537e232b`
-   IAM user for GitHub Actions: `GlownScanGitHubActions`
-   Custom IAM policy: `GlownScanGitHubSSMDeployPolicy`
-   EC2 role documented during setup: `GlownScanEC2SSMRole`
-   EC2 managed policy: `AmazonSSMManagedInstanceCore`

Verify resource names in IAM before changing them.

## A. EC2 instance role

The EC2 instance needs an IAM role that lets the SSM Agent register and
receive commands.

1.  Open IAM → Roles.
2.  Find the role attached to the EC2 instance.
3.  Confirm it has `AmazonSSMManagedInstanceCore`, or an equivalent
    least-privilege policy.
4.  In EC2 → Instance → Security, confirm the expected role is attached.

An AWS Systems Manager Default Host Management Configuration may also
have been enabled during troubleshooting. Check the actual configuration
rather than attaching duplicate roles without a reason.

## B. SSM Agent and managed-node status

On Ubuntu, the SSM Agent was installed and running during setup. Verify
it in the Systems Manager Console:

1.  Open Systems Manager in `ap-southeast-2`.
2.  Go to **Fleet Manager → Managed nodes** (the exact console label may
    vary).
3.  Find instance `i-009ee9f9e537e232b`.
4.  Confirm it is `Online`.

If it is not Online, check the EC2 role, agent status, network egress,
and Systems Manager registration.

## C. GitHub Actions IAM user

The current setup uses an IAM user with an access key stored in GitHub
Secrets. This is operational but a long-lived access key must be
protected and rotated. Prefer GitHub OIDC with an IAM role when it is
available and configured.

The custom policy should permit only the deployment operations required.
A baseline policy for this exact instance is:

``` json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "SendDeployCommandsToGlownScanEC2",
      "Effect": "Allow",
      "Action": "ssm:SendCommand",
      "Resource": [
        "arn:aws:ssm:ap-southeast-2::document/AWS-RunShellScript",
        "arn:aws:ec2:ap-southeast-2:877886324433:instance/i-009ee9f9e537e232b"
      ]
    },
    {
      "Sid": "ReadCommandResults",
      "Effect": "Allow",
      "Action": [
        "ssm:GetCommandInvocation",
        "ssm:ListCommandInvocations",
        "ssm:ListCommands"
      ],
      "Resource": "*"
    },
    {
      "Sid": "CheckManagedInstanceStatus",
      "Effect": "Allow",
      "Action": "ssm:DescribeInstanceInformation",
      "Resource": "*"
    }
  ]
}
```

This policy is a starting point based on the current workflow. Validate
the exact resource-level authorization requirements against the AWS
actions in use. If the workflow adds SSM actions, update the policy
narrowly rather than granting broad `ssm:*`.

## D. Create or update the policy

1.  Open IAM → Policies.
2.  Open `GlownScanGitHubSSMDeployPolicy`.
3.  Edit the JSON policy.
4.  Review the policy and save the new version as default.
5.  Open IAM → Users → `GlownScanGitHubActions` → Permissions.
6.  Confirm the policy is attached to that user.

Saving a policy does not automatically attach it to an identity.

## E. Create access keys

1.  Open IAM → Users → `GlownScanGitHubActions`.
2.  Open **Security credentials**.
3.  Under **Access keys**, create a key only if one does not already
    exist.
4.  Copy the secret access key once and save it securely into GitHub
    Secrets.
5.  Never commit or share the key.

Do not create extra keys unnecessarily. Disable and remove old keys
after confirming the replacement works.

## F. Test SSM access

From GitHub Actions, after configuring AWS credentials, run:

``` bash
aws sts get-caller-identity

aws ssm describe-instance-information \
  --filters "Key=InstanceIds,Values=i-009ee9f9e537e232b" \
  --query "InstanceInformationList[].{InstanceId:InstanceId,PingStatus:PingStatus,PlatformName:PlatformName}" \
  --output table
```

Expected: account `877886324433` and a managed-node row with
`PingStatus` equal to `Online`.

## Security notes

-   Do not use `AdministratorAccess` for the GitHub Actions identity.
-   Restrict SSM `SendCommand` to the intended document and instance
    wherever supported.
-   Keep EC2 instance role and GitHub Actions IAM user separate; they
    serve different purposes.
-   Review CloudTrail and IAM access-key activity periodically.
