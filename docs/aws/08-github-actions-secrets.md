# AWS Setup 08 --- GitHub Actions Secrets and Variables

## Location

In the GitHub repository `PawPasta/glownscan_be`:

**Settings → Secrets and variables → Actions**

Use **Secrets** for credentials and **Variables** for non-sensitive
configuration.

## Required repository secrets

  ----------------------------------------------------------------------------
  Name                      Type                    Purpose
  ------------------------- ----------------------- --------------------------
  `AWS_ACCESS_KEY_ID`       Secret                  IAM access key ID for
                                                    `GlownScanGitHubActions`

  `AWS_SECRET_ACCESS_KEY`   Secret                  Secret key for that IAM
                                                    user
  ----------------------------------------------------------------------------

The values must come from the IAM user. Never put these values in
workflow YAML, committed files, or logs.

## Required repository variables

  Name                Type       Example value
  ------------------- ---------- -----------------------
  `AWS_REGION`        Variable   `ap-southeast-2`
  `EC2_INSTANCE_ID`   Variable   `i-009ee9f9e537e232b`

If `AWS_REGION` is missing or saved as a Secret while the workflow reads
`vars.AWS_REGION`, the AWS credentials action may fail with:

``` text
Input required and not supplied: aws-region
```

Either create the repository variable exactly as named or set the region
explicitly in the workflow:

``` yaml
aws-region: ap-southeast-2
```

Do not define both forms unless there is a clear reason.

## GHCR-related values

Depending on the workflow and package visibility, GHCR publishing can
use the built-in `GITHUB_TOKEN`. If the existing workflow uses
`GHCR_USER` and `GHCR_TOKEN`, retain them until the workflow has been
reviewed and verified. Do not delete old secrets before confirming they
are no longer referenced.

## Legacy SSH secrets

The previous SSH-based workflow may use:

-   `EC2_HOST`
-   `EC2_USER`
-   `EC2_SSH_KEY`

Keep these until SSM deployment is verified and the repository no longer
references them. Once SSM is confirmed, remove unused SSH deployment
secrets as a separate cleanup task. Administrator SSH access from a
local computer is independent of GitHub secrets.

## Test the values

A manually triggered, read-only workflow can run:

``` yaml
- name: Configure AWS credentials
  uses: aws-actions/configure-aws-credentials@v4
  with:
    aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
    aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
    aws-region: ${{ vars.AWS_REGION }}

- name: Verify AWS identity
  run: aws sts get-caller-identity
```

Then test `aws ssm describe-instance-information` as shown in
`07-iam-and-ssm.md`.

## Rotation

If an AWS key is exposed or accidentally committed: 1. Create a
replacement access key. 2. Update the GitHub Secret. 3. Run the
read-only AWS test workflow. 4. Deactivate and delete the exposed key.
5. Review CloudTrail for unexpected use.
