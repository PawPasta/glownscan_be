set -euo pipefail

# This script contains no credentials.
# Docker must already be authenticated to GHCR for the ubuntu user.
cp .github/scripts/deploy-container-on-ec2.sh deploy.sh

# Substitute the image values without interpolating them into shell code.
sed -i \
  -e "s|__IMAGE__|$IMAGE|g" \
  -e "s|__IMAGE_TAG__|$IMAGE_TAG|g" \
  deploy.sh

# SSM runs commands as root by default. Run Docker as ubuntu,
# whose Docker login is used for the private GHCR package.
BASE64_SCRIPT=$(base64 -w 0 deploy.sh)
REMOTE_COMMAND="echo '$BASE64_SCRIPT' | base64 -d | sudo -u ubuntu bash"

PARAMETERS=$(jq -n --arg command "$REMOTE_COMMAND" \
  '{commands: [$command]}')

COMMAND_ID=$(aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --comment "GlownScan deployment $IMAGE_TAG" \
  --parameters "$PARAMETERS" \
  --query 'Command.CommandId' \
  --output text)

echo "SSM command ID: $COMMAND_ID"

for ATTEMPT in $(seq 1 60); do
  STATUS=$(aws ssm get-command-invocation \
    --command-id "$COMMAND_ID" \
    --instance-id "$INSTANCE_ID" \
    --query 'Status' \
    --output text 2>/dev/null || true)

  case "$STATUS" in
    Success)
      echo "Deployment completed successfully."
      aws ssm get-command-invocation \
        --command-id "$COMMAND_ID" \
        --instance-id "$INSTANCE_ID" \
        --query 'StandardOutputContent' \
        --output text
      exit 0
      ;;
    Failed|Cancelled|TimedOut)
      echo "Deployment failed. SSM status: $STATUS"
      aws ssm get-command-invocation \
        --command-id "$COMMAND_ID" \
        --instance-id "$INSTANCE_ID" \
        --query '{stdout:StandardOutputContent,stderr:StandardErrorContent}' \
        --output json || true
      exit 1
      ;;
  esac

  sleep 5
done

echo "Timed out waiting for the SSM command."
exit 1
