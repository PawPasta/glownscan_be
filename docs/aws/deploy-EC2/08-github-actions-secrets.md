# AWS Setup 08 — GitHub Actions Secrets and Variables

## Repository settings

In `PawPasta/glownscan_be`, open **Settings → Secrets and variables → Actions**.

### Required repository secrets

| Name                    | Type   | Value                                                      |
| ----------------------- | ------ | ---------------------------------------------------------- |
| `AWS_ACCESS_KEY_ID`     | Secret | Active access key ID for IAM user `GlownScanGitHubActions` |
| `AWS_SECRET_ACCESS_KEY` | Secret | Matching secret access key for that IAM user               |

Create or rotate the key in AWS IAM, then enter each value directly in its
GitHub repository secret field. Never put either value in a repository
variable, workflow, Markdown file, terminal output, or chat. The deployment
workflow reads the secrets only in its AWS credentials action.

### Required repository variables

| Name              | Type     | Example               | Purpose                                |
| ----------------- | -------- | --------------------- | -------------------------------------- |
| `EC2_INSTANCE_ID` | Variable | `i-009ee9f9e537e232b` | Target EC2 instance for SSM deployment |

The workflow fixes the AWS region to `ap-southeast-2`; `AWS_REGION` is not
required. `AWS_DEPLOY_ROLE_ARN` is not used by this workflow and must not be
set as a substitute for the access-key secrets.

## Workflow authentication

The deploy job configures AWS credentials using:

```yaml
- name: Configure AWS credentials
  uses: aws-actions/configure-aws-credentials@v4
  with:
    aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
    aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
    aws-region: ap-southeast-2
```

It then runs `aws sts get-caller-identity` and fails deployment unless the
account is `877886324433` and the principal ARN is
`arn:aws:iam::877886324433:user/GlownScanGitHubActions`. This does not print
the secret key.

The GitHub Actions IAM user must have the least-privilege SSM policy described
in `07-iam-and-ssm.md`. The EC2 instance continues to use its separate
`GlownScanEC2SSMRole` and must show as Online in Systems Manager.

## GHCR and legacy SSH values

The workflow uses the built-in `GITHUB_TOKEN` to publish images to GHCR.
Legacy SSH secrets (`EC2_HOST`, `EC2_USER`, `EC2_SSH_KEY`) are not used by the
SSM deployment workflow; remove them only after checking whether another
workflow or administrator process still needs them.

## Troubleshooting

- `InvalidClientTokenId`: confirm the access key ID is active and belongs to
  `GlownScanGitHubActions`.
- `SignatureDoesNotMatch`: confirm `AWS_SECRET_ACCESS_KEY` is the matching
  secret for that key ID. AWS does not let you retrieve a lost secret; create
  a replacement key and update the GitHub secret.
- `AccessDenied`: check the IAM user's attached SSM policy and resource scope;
  do not grant `AdministratorAccess` as a workaround.
- `SSM instance not found` or Offline: check `EC2_INSTANCE_ID`, region, EC2
  instance role, SSM Agent, and network connectivity.
- `Credentials could not be loaded`: confirm both required GitHub repository
  secrets exist and are available to the workflow. Do not print their values
  while debugging.

After confirming a deployment with a replacement key, deactivate the old key
and review CloudTrail for unexpected use. Do not delete any unused OIDC
provider or IAM role; another workflow or repository may still rely on it.
