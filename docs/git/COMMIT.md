# Commit message rules

Write each commit message in this format:

```text
<action>: <message>
```

Use a lowercase action, a colon, one space, and a short imperative message.
Keep each commit focused on one change.

Common actions:

| Action     | Use for                           |
| ---------- | --------------------------------- |
| `feat`     | A new feature                     |
| `fix`      | A bug fix                         |
| `docs`     | Documentation changes             |
| `refactor` | A behavior-preserving code change |
| `test`     | Tests                             |
| `chore`    | Maintenance and tooling           |
| `build`    | Build or dependency changes       |
| `ci`       | CI configuration                  |
| `perf`     | Performance improvements          |
| `style`    | Formatting-only changes           |
| `revert`   | Reverting a previous commit       |

Examples:

```text
docs: commit rules
feat: add password value object
fix: normalize error responses
```

Avoid vague messages such as `update`, `changes`, or `fix stuff`.
