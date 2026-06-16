---
mode: testing
---

# Meal booking (non-destructive)

Authenticated as a staff user (seeded testing session).

## Meals page loads
Go to {{base_url}}/meals.
Verify the meal booking UI is visible.
Verify veg / non-veg meal options are shown.

## My meal box loads
Go to {{base_url}}/my-meal-box.
Verify the meal box page (or an empty-state message) is visible.
Do NOT confirm a booking — this is a non-destructive check.
