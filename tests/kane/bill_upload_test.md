---
mode: testing
---

# Bill upload (non-destructive)

Authenticated as a finance user (seeded testing session).

## Bills page loads
Go to {{base_url}}/bills.
Verify the bills list UI is visible.

## Upload control present
Verify a bill upload / add control is visible.
Do NOT upload a file — this is a non-destructive check.

## Approval page loads
Go to {{base_url}}/bills/approve.
Verify the bill approval UI (or an empty-state message) is visible.
