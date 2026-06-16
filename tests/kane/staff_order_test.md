---
mode: testing
---

# Staff order flow (non-destructive)

Authenticated as a staff user (seeded testing session).

## Request page loads
Go to {{base_url}}/request.
Verify the cafeteria ordering UI is visible.
Verify at least one orderable item is listed.

## Item selection opens order details
Select the first available beverage item.
Verify a quantity / delivery-mode control appears.
Do NOT place the order — this is a non-destructive check.

## Own orders page loads
Go to {{base_url}}/orders.
Verify the orders list (or an empty-state message) is visible.
