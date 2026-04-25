# Camel Backend

Backend service for Camel, an agent-based knowledge management system.

## Prerequisites

- Node.js 20+
- npm
- Docker + Docker Compose
- Encore CLI

Install Encore:

- macOS: `brew install encoredev/tap/encore`
- Linux: `curl -L https://encore.dev/install.sh | bash`
- Windows PowerShell: `iwr https://encore.dev/install.ps1 | iex`

## Dev Workflow

```bash
# 1. Install dependencies
npm install

# 2. Start the database and other services (if any)
npm run docker:up

# 3. Generate local JWT secret + apply DB migrations
npm run setup

# 4. Start the dev server
encore run
```

- API: `http://127.0.0.1:4000`
- Encore dashboard: `http://127.0.0.1:9400`

## Docker

Docker runs backing services only (Postgres). The app itself always runs locally via `encore run`.

```bash
npm run docker:up     # start services
npm run docker:down   # stop services
```

Data is persisted in a named Docker volume (`db_data`).

## Test

```bash
npm test        # unit tests
encore test     # unit tests + infrastructure (isolated DB)
```

## Database

Migrations live in `prisma/migrations/`. To create a new migration after editing `schema.prisma`:

```bash
npm run prisma:migrate   # prisma migrate dev (creates + applies)
npm run prisma:generate  # regenerate Prisma client after schema changes
```
