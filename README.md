# Portfolio API

The portfolio API and dashboard are separate deployables. The API is a Node.js/TypeScript Express service; PostgreSQL stores projects and visit events. The dashboard is its own Next.js app and uses Tailwind utilities for styling.

## API contract

Base URL: `https://<api-host>`

- `GET /health` — health check.
- `POST /auth/login` — JSON `{ "email", "password" }`; returns `{ "token", "expiresIn" }`. Send the token as `Authorization: Bearer <token>` to admin routes.
- `GET /projects` — published projects for the public portfolio.
- `GET /admin/projects` — all projects, requires admin token.
- `PUT /admin/projects/:id` — create or update a project, requires admin token.
- `DELETE /admin/projects/:id` — delete a project, requires admin token.
- `POST /track` — JSON `{ "path", "sessionId", "referrer?" }`; public, rate limited.
- `GET /admin/analytics?days=30` — totals, daily series, popular pages, and referrers, requires admin token. `days` is capped at 90.

Projects use `id`, `title`, `description`, `tech`, `thumbnail`, `screenshot`, optional `github` and `live`, `caseStudy` (`problem`, `approach`, `highlights`, `outcome`), `published`, and `sortOrder`. The server validates inputs. Project image fields are URLs/paths; this initial version does not include media upload storage.

## Data and visit counting

Run `psql "$DATABASE_URL" -f schema.sql` and then `psql "$DATABASE_URL" -f seed.sql` against the Render PostgreSQL database. The seed imports the four projects currently hard-coded in the portfolio so they can be managed in the dashboard. The portfolio retains its local fallback until `NEXT_PUBLIC_PORTFOLIO_API_URL` is configured.

The portfolio creates a random first-party session ID in `sessionStorage` and sends the current path and document referrer to `/track`. The API stores no raw IP: it HMAC-hashes the IP with a server-only secret and a calendar-month prefix. The session identifier is also HMAC-hashed before storage. This supports approximate monthly unique visitors and session/page-view counts; it is not a person-level measurement. A repeated page path within the same session is suppressed for 30 minutes. Referrers are reduced to host names, and paths exclude query strings. Configure proxy trust correctly for the Render service before production; Express trusts one proxy hop.

## Local development

From the parent `portfolio/` folder, start PostgreSQL with `docker compose up -d postgres`. Compose initializes a fresh database from `backend/schema.sql` and `backend/seed.sql`. Then run `cd backend && npm install && npm run dev`, `cd dashboard && npm install && npm run dev`, and run the portfolio from `portfolio-page/` as usual. Local dashboard credentials are `admin@example.com` / `local-dev-only-change-me`. These development credentials and local secrets must never be used in production.

## Deploy

1. Create a Render PostgreSQL instance and deploy `backend/` as a Node web service (or use `backend/render.yaml`). Set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `PORTFOLIO_ORIGIN`, and `DASHBOARD_ORIGIN`; keep generated `JWT_SECRET` and `IP_HASH_SECRET` private.
2. Initialize the database with `backend/schema.sql`.
3. Deploy the portfolio as it is currently deployed and set `NEXT_PUBLIC_PORTFOLIO_API_URL` to the API origin. Its visible layout and styles are unchanged.
4. Deploy `dashboard/` separately and set `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_PORTFOLIO_URL` at build time.

The dashboard token is kept in `sessionStorage` and expires server-side after eight hours. Restrict CORS to the exact deployed site origins. Use HTTPS for all three services.
