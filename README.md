# Applyways Office Pantry — Inventory Management

Phase 1 MVP from the PRD. React + Vite + Tailwind frontend, Node/Express API, Supabase (Postgres) for data and auth.

## Project layout

```
inventory/
  frontend/      React + Vite + Tailwind UI (facility manager, dashboards, request flows)
  backend/       Node.js + Express API (validates auth, talks to Supabase)
  supabase/
    migrations/  SQL schema
    seed/        Starter 34-product catalog
  tests/         Playwright E2E
  docs/          Internal notes
```

## Roles

- `facility_manager` — daily stock updates, view alerts
- `finance` — spending reports (read transactions)
- `leadership` — everything (super-admin)
- `staff` — employee request access only; no inventory visibility

## Quick start

### 1. Supabase project

1. Create a project at supabase.com.
2. In SQL Editor, run `supabase/migrations/0001_init_schema.sql`.
3. Then run `supabase/seed/seed_products.sql` to load the 34 starter products.
4. In Auth → Providers, enable Email (magic link is used).
5. Create your first users (Authentication → Users → Invite user). After signup, run this in SQL editor to assign roles:

   ```sql
   update public.profiles set role = 'leadership'      where id = (select id from auth.users where email='you@applyways.com');
   update public.profiles set role = 'facility_manager' where id = (select id from auth.users where email='fm@applyways.com');
   update public.profiles set role = 'finance'          where id = (select id from auth.users where email='finance@applyways.com');
   ```

### 2. Backend

```bash
cd backend
cp .env.example .env
# fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (Project settings → API)
npm install
npm run dev    # http://localhost:4000
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env.local
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
npm run dev    # http://localhost:5173
```

Sign in with the magic link, then navigate based on your role.

### 4. E2E tests (optional)

```bash
cd tests
npm install
npx playwright install --with-deps chromium
npm test
```

The signed-in test block is skipped by default. To enable it, generate a Supabase session and save it as `tests/e2e/.auth/state.json`, then export `E2E_STORAGE_STATE=tests/e2e/.auth/state.json` before running.

---

## Recommended developer-side tooling

These are *Claude Code / Cursor / VS Code* productivity boosters that improve quality of work on this codebase. They run on **your** machine — they are not part of the deployed app.

### Playwright MCP (UI testing)

Lets Claude drive a real browser end-to-end against the running app.

Install in Claude Code:

```bash
claude mcp add playwright -- npx @playwright/mcp@latest
```

Then ask Claude to "use Playwright MCP to walk the daily update flow and screenshot each step."

### Postgres MCP (Supabase schema introspection)

Lets Claude inspect your live schema before writing queries, which dramatically reduces query bugs. Supabase exposes Postgres on `db.<project>.supabase.co:5432` — get the connection string from Project Settings → Database → Connection string (URI).

```bash
claude mcp add postgres -- npx -y @modelcontextprotocol/server-postgres "postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres"
```

**Use a read-only role** for safety. In Supabase SQL editor:

```sql
create role mcp_read login password 'pick-a-strong-password';
grant connect on database postgres to mcp_read;
grant usage on schema public to mcp_read;
grant select on all tables in schema public to mcp_read;
alter default privileges in schema public grant select on tables to mcp_read;
```

Then point the MCP at `postgresql://mcp_read:pick-a-strong-password@db.[PROJECT].supabase.co:5432/postgres`.

### Frontend Design skill

If you're using Claude Code skills, install the Frontend Design skill from your marketplace to enforce pixel-accurate Tailwind output. (Reach out for the latest install command — skills move around.)

### rtk (Rust Token Killer)

Optional but recommended: wraps common dev commands so Claude Code uses 60–90% fewer tokens. Project home: `https://github.com/rtk-ai/rtk`.

Install on Mac/Linux:

```bash
curl -sSf https://rtk-ai.app/install.sh | sh
rtk init -g          # registers hooks for Claude Code
```

On Windows, grab the release binary from the GitHub releases page and run `rtk init -g`.

### GitHub MCP (optional, for hands-free PRs)

Not selected in this build but easy to add later:

```bash
claude mcp add github -e GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxx -- npx -y @modelcontextprotocol/server-github
```

---

## Phase 2 hooks (not implemented yet)

- Hyperpure API integration for automated ordering (PRD §4.3, §9 week 4+)
- Slack / email notifications for low-stock and expiry alerts
- Consumption-trend analytics
- Offline mode for the daily update form
