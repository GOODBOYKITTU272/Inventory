---
mode: testing
---

# Public smoke

## Login page loads
Go to {{base_url}}/login.
Verify the login page is visible.
Store the main heading as "login_heading".

## Protected route redirects
Go to {{base_url}}/dashboard.
Verify the app redirects to the login page.
Store the current URL as "redirect_url".
