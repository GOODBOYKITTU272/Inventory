# Applywizz Pantry app context

This app is a cafeteria and pantry management system.

Use testing mode. Prefer non-destructive checks unless a test explicitly says to create a test record.

Important routes:

- /login
- /request
- /orders
- /queue
- /meals
- /my-meal-box
- /meal-token-dashboard
- /dashboard
- /daily-update
- /finance
- /bills
- /bills/approve
- /admin

Roles:

- staff: request food/drinks and view own orders
- office_boy: process queue and meal tokens
- facility_manager: dashboard, inventory, daily update
- finance: finance and bill approval
- leadership: admin access

Login is passwordless: users sign in with a company email magic link
(@applywizz.ai only). Automated browser tests cannot click a real email link,
so use testing mode / seeded sessions for authenticated flows.

Never expose or print passwords, Supabase service keys, Telegram tokens, webhook keys, or OpenAI keys.
