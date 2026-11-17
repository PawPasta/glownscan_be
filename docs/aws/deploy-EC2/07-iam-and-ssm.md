# AWS Setup 07 --- IAM Roles, IAM User, and Systems Manager

## Purpose

SSM is the remote command channel used by GitHub Actions to deploy to
EC2. This avoids needing GitHub-hosted runners to connect to SSH port
22.

## Resources in this setup

-   Region: `ap-southeast-2`
-   EC2 instance: `i-009ee9f9e537e232b`
-   GitHub Actions OIDC deployment role: verify the configured role ARN in GitHub repository variables.
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

## C. GitHub Actions OIDC role

GitHub Actions authenticates with GitHub OIDC and an IAM role; it does not use
long-lived AWS access keys. Create an IAM OIDC provider for
`token.actions.githubusercontent.com`, restrict the role trust policy to this
repository and the `main` branch, then set `AWS_DEPLOY_ROLE_ARN` as a GitHub
repository variable. The workflow requires the `id-token: write` permission.

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
5.  Open IAM → Roles and select the GitHub OIDC deployment role.
6.  Confirm the policy is attached to that role.

Saving a policy does not automatically attach it to an identity.

## E. Configure GitHub repository variables

Set `AWS_DEPLOY_ROLE_ARN` under **Settings → Secrets and variables → Actions
→ Variables**. The workflow uses the fixed region `ap-southeast-2` and needs
no long-lived AWS access keys.

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

-   Do not use `AdministratorAccess` for the GitHub Actions role.
-   Restrict SSM `SendCommand` to the intended document and instance
    wherever supported.
-   Keep EC2 instance role and GitHub Actions OIDC role separate; they
    serve different purposes.
-   Review CloudTrail role-assumption activity periodically.
