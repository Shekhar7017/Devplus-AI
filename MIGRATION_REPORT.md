# Supabase to Spring Boot/PostgreSQL migration report

## Audit findings

The original frontend directly accessed Supabase from authentication, organization, project, sprint/task, dashboard, telemetry, analytics, and AI modules. Database migrations defined organization membership, projects, sprints, tasks and task-status history, telemetry API keys/build runs, AI interactions, and simulation datasets. Supabase Edge Functions provided Gemini assistance and build-run ingestion.

## Implemented in this repository

- Added `backend/`, a Java 21/Spring Boot service with independent PostgreSQL configuration, Flyway migration, BCrypt authentication, server-side sessions, CSRF protection, explicit CORS origins, and a public health endpoint.
- Added REST operations for registration/login/logout/current user, tenant-scoped organizations and memberships, projects, sprint/task lifecycle and task status history, build telemetry/API keys, Gemini assistance, and analytics simulation records.
- Added organization membership and role checks to tenant operations. Task IDs, project IDs, and organization IDs supplied by clients are checked against the authenticated account.
- Replaced frontend Supabase calls with the existing Axios API client and removed the Supabase SDK dependency. The existing UI structure and styling remain in place.
- Added root Docker Compose, a PostgreSQL named volume, a non-root backend image, an unprivileged Nginx frontend image, Vite API proxy configuration, and environment examples.
- Kept original SQL migrations as references; they are not part of backend runtime.

## Data migration status

- **Destination schema:** implemented as Flyway V1.
- **Existing data:** not transferred. No source Supabase database credentials or export were provided, and no import was attempted.
- **Migration prepared:** administrators should export allowed public application tables, preserve UUID relationships, and import in foreign-key order. Users must reset passwords because the old Supabase Auth credential store is not an interchangeable BCrypt credential source.

## Verification

- Frontend TypeScript typecheck and production build: passed. Lint: passed with 8 Fast Refresh warnings and no errors.
- `npm uninstall @supabase/supabase-js`: completed; npm reported existing dependency audit advisories.
- Backend Maven package and unit tests: passed in Docker; Maven is not installed on the host.
- Docker Compose build and full-stack smoke checks: passed. Verified registration/login/logout and session-cookie behavior, organization/project/task creation and transitions, sprint lifecycle, tenant isolation (403), API-key build ingestion/idempotency, AI's explicit unconfigured response (503), and unauthenticated access (401).
- PostgreSQL-backed API workflows were smoke-tested against the Compose database. There is no automated Testcontainers integration-test suite yet.

## Remaining work / deployment caveats

- Add automated Spring integration tests against PostgreSQL/Testcontainers.
- Configure rate limiting for authentication and AI endpoints before public production deployment.
- Review and exercise role matrices with multiple organizations and user accounts before production.
- Configure TLS, secure cookies, production CORS origins, database backups, observability, and secret management in the deployment environment.
- Execute and reconcile a real data export/import separately; the current implementation intentionally does not claim data transfer.
