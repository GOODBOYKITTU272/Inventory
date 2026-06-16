# ECC Usage Policy

ECC is used **only as development guidance**. It is not a production dependency
and must not control runtime behavior.

ECC may guide:

- code review
- UI consistency
- architecture checks
- accessibility review
- test coverage suggestions
- refactoring suggestions

ECC must NOT:

- control production behavior
- make runtime decisions
- replace backend validation
- replace role-based access control
- override database rules
- become a production dependency

## Related tooling boundaries

- **kane-cli** — development / CI real-browser validation only (smoke, release,
  flow checks). Does NOT replace Playwright (which remains for deterministic
  regression tests) and is NOT part of the app runtime.
- **Agent-Reach** — external developer research only. See
  `developer-agent-research.md`. Never wired into runtime or user-facing logic.
