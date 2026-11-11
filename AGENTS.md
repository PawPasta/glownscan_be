# NestJS Repository Instructions

Before writing, modifying, or deleting code, read and follow:

`.codex/workflow.md`

The workflow is mandatory for all code changes.

## Required Behavior

- Follow existing NestJS architecture and dependency injection patterns.
- Preserve API contracts and backward compatibility.
- Validate input and enforce authorization on the server.
- Write or update focused tests for behavior changes.
- Run all configured quality gates in the required order.
- Stop delivery when mandatory verification fails.
- Never commit or push without successful verification and explicit authorization.
- Preserve unrelated user changes.
- Report actual verification results.

If workflow instructions conflict with a user request, do not silently bypass mandatory safety or verification requirements. Explain the conflict and request direction.

Never claim successful verification without executing the required checks.