# DevPlus

DevPlus is a React/TypeScript SaaS prototype for organization, project, sprint, task, analytics, AI-assistance, and build-telemetry workflows. Its backend now runs independently of Supabase:

- **Frontend:** React, TypeScript, Vite, Tailwind CSS
- **Backend:** Java 21, Spring Boot 3, Spring Security, Spring Data JPA, Spring JDBC
- **Database:** independent PostgreSQL, versioned with Flyway
- **AI:** optional Gemini API access from the backend only
- **Deployment:** Docker Compose, with Nginx serving the SPA and proxying `/api/`

The existing UI remains in the repository root; the Java service is in `backend/`.

## Requirements

- Java 21
- Maven 3.9+
- Node.js 20+ and npm
- PostgreSQL 16 for local development, or Docker Desktop with Docker Compose

## Run with Docker Compose (Windows)

From the project root:

```powershell
Copy-Item .env.example .env
```

Edit `.env` and replace `DB_PASSWORD` with a unique, long password. Then start the stack:

```powershell
docker compose up --build
```

Open `http://localhost:8081`. PostgreSQL is not published to the host; its data persists in the `postgres_data` named volume. Flyway creates the schema at backend startup. Register the first account in the UI and create an organization through onboarding.

To stop the containers while preserving the database:

```powershell
docker compose down
```

To deliberately remove the database and its persisted data, use `docker compose down --volumes` only after making a backup.

## Run locally without Docker

1. Start PostgreSQL and create a database/user named `devplus`.
2. Set the backend variables from `backend/.env.example` in the shell or your IDE run configuration. Do not commit a real `.env`.
3. Start the backend:

   ```powershell
   Set-Location backend
   mvn spring-boot:run
   ```

4. In another terminal, start the frontend:

   ```powershell
   npm ci
   npm run dev
   ```

Vite proxies `/api` to `http://localhost:8080` by default. Set `VITE_BACKEND_URL` to override the proxy target, or set `VITE_API_BASE_URL` when the API is served from a different base URL.

## Configuration

| Variable | Purpose |
| --- | --- |
| `DB_URL` | JDBC URL, e.g. `jdbc:postgresql://localhost:5432/devplus` |
| `DB_USERNAME` / `DB_PASSWORD` | PostgreSQL credentials |
| `SESSION_COOKIE_SECURE` | Set `true` behind HTTPS in production |
| `APP_CORS_ALLOWED_ORIGINS` | Comma-separated explicit browser origins |
| `GEMINI_API_KEY` | Optional backend-only key for AI assistance |
| `GEMINI_MODEL` | Gemini model name; defaults to `gemini-2.0-flash` |
| `VITE_API_BASE_URL` | Frontend API base; normally `/api/v1` |

Never put database credentials or the Gemini key in a `VITE_*` variable. The session cookie is HttpOnly, and mutating browser requests use Spring Security's CSRF cookie/header. Production deployment must use HTTPS, set `SESSION_COOKIE_SECURE=true`, replace all example credentials, and restrict allowed origins.

## API overview

All application endpoints are under `/api/v1`. Authenticated APIs use an HttpOnly server session:

- `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`
- `GET/POST /organizations`, `PUT /organizations/{id}`, organization member list/add/update/remove
- `GET/POST /projects`, `PUT /projects/{id}`, `POST /projects/{id}/archive`
- Project sprint and task listing/creation, sprint lifecycle actions, task updates/transitions/history
- Project build-run and API-key management; `POST /telemetry/ingest-build-run` accepts `X-API-Key`
- AI interaction history/decision endpoints and `POST /ai/assist`
- Simulation dataset generation/listing/deletion
- `GET /health`; Actuator health is available internally to Docker Compose at `/actuator/health`

Spring Security requires a valid organization membership for tenant-scoped operations and checks roles for administrative actions. Passwords are BCrypt-hashed. API keys are stored as SHA-256 hashes and shown only at creation.

## Database migrations and data migration

Flyway applies `backend/src/main/resources/db/migration/V1__initial_schema.sql`. Hibernate uses `ddl-auto: validate`; it does not create, update, or drop production schema objects.

The original SQL migrations remain under `supabase/migrations/` as **read-only migration references**. No existing Supabase data has been exported or imported by this code change. To migrate data, first export the old public tables using an authorized database connection and review the records before loading them into the matching independent PostgreSQL schema. Preserve UUIDs and foreign-key order. Supabase Auth credentials are not directly reusable as Spring BCrypt hashes; plan account password resets instead of importing credential hashes. Do not place a production database URL in shell history or committed files.

For a fresh prototype, the Compose stack initializes an empty database automatically. For backup and restore, use PostgreSQL's `pg_dump`/`pg_restore` against the independent database; keep backups encrypted and outside source control.

## Build and tests

```powershell
npm ci
npm run typecheck
npm run build
npm run lint
```

```powershell
Set-Location backend
mvn test
mvn package
```

Containerized checks can be run with `docker compose build` and `docker compose up`; verify the public `/api/v1/health` endpoint and the backend's internal Actuator health check with `docker compose exec backend wget -qO- http://localhost:8080/actuator/health`.
