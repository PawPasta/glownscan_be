# AWS Setup 08 — GitHub Actions OIDC Configuration

## Location

In the GitHub repository `PawPasta/glownscan_be`:

**Settings → Secrets and variables → Actions**

The deployment workflow uses GitHub OIDC to assume an AWS IAM role. It does
not require long-lived AWS access-key secrets.

## Required repository variables

| Name | Type | Example | Purpose |
| --- | --- | --- | --- |
| `AWS_DEPLOY_ROLE_ARN` | Variable | `arn:aws:iam::<account-id>:role/<github-deploy-role>` | Role assumed through GitHub OIDC |
| `EC2_INSTANCE_ID` | Variable | `i-009ee9f9e537e232b` | Target EC2 instance |

The AWS region is set in the workflow to `ap-southeast-2`; no `AWS_REGION`
variable is required.

## AWS prerequisites

1. Create an IAM OIDC identity provider with URL
   `https://token.actions.githubusercontent.com` and audience
   `sts.amazonaws.com`.
2. Create a deployment IAM role with a trust policy restricted to this
   repository and the `main` branch. The subject should be
   `repo:PawPasta/glownscan_be:ref:refs/heads/main`.
3. Attach the least-privilege SSM deployment policy described in
   `07-iam-and-ssm.md` to that role.
4. Save the role ARN as the repository Actions variable
   `AWS_DEPLOY_ROLE_ARN`.

The deploy job needs `id-token: write`; the workflow scopes this permission to
that job. The credentials action must include `role-to-assume`; a role-session
name, region, audience, and environment-output option alone cannot obtain AWS
credentials.

The workflow uses:

```yaml
- name: Configure AWS credentials
  uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}
    role-session-name: glownscan-github-deploy
    aws-region: ap-southeast-2
    audience: sts.amazonaws.com
    output-env-credentials: true
```

Before the action, the workflow validates `AWS_DEPLOY_ROLE_ARN`. Afterward, it
runs `aws sts get-caller-identity` to confirm which role was assumed.

## Troubleshooting `Credentials could not be loaded`

- Confirm `AWS_DEPLOY_ROLE_ARN` exists as a repository **Variable** and
  contains a full IAM role ARN, not a role name or access key.
- Confirm the credentials step includes
  `role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}`.
- Confirm the deploy job has `id-token: write` permission.
- Confirm the IAM OIDC provider audience is `sts.amazonaws.com` and the role
  trust policy subject matches
  `repo:PawPasta/glownscan_be:ref:refs/heads/main`.
- Use the `aws sts get-caller-identity` step to distinguish role-assumption
  problems from SSM permission problems.

Do not fix this by committing keys or reintroducing long-lived AWS access-key
secrets.

## GHCR and legacy SSH values

The current workflow uses the built-in `GITHUB_TOKEN` to publish to GHCR. Old
SSH secrets (`EC2_HOST`, `EC2_USER`, `EC2_SSH_KEY`) can be removed only after
confirming that no other workflow or operator process uses them. They are not
AWS credentials and are unrelated to GitHub OIDC.

## Verify SSM access

After `aws sts get-caller-identity` succeeds, test
`aws ssm describe-instance-information` as shown in `07-iam-and-ssm.md`.
