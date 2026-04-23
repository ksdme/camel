# Camel Backend

Backend service for Camel, an agent-based knowledge management system.

## Prerequisites

- Node.js 20+
- npm
- Encore CLI

Install Encore:

- macOS: `brew install encoredev/tap/encore`
- Linux: `curl -L https://encore.dev/install.sh | bash`
- Windows PowerShell: `iwr https://encore.dev/install.ps1 | iex`

## Install

From this `backend/` directory:

```bash
npm install
```

This also bootstraps local secrets and initializes the local database.

## Initialize Local Development

`npm install` is the full local setup step.

```bash
npm install
```

That does two things:

- creates local secrets when missing
- applies the Prisma migration to the local SQLite database

If you only need the database step:

```bash
npm run init:db
```

## Run The Backend

```bash
encore run
```

Default local endpoints:

- API: `http://127.0.0.1:4000`
- Encore dashboard: `http://127.0.0.1:9400`

## Test

```bash
npm test
```

For infrastructure-backed tests, use:

```bash
encore test
```

## Current API

- `GET /`
- `POST /auth/login`
- `GET /auth/me`
- `POST /auth/logout`

Example login payload:

```json
{
  "username": "C0oki3s",
  "password": "Password@0"
}
```

Protected endpoints require:

```text
Authorization: Bearer <token>
```

## Useful Commands

```bash
npm run prisma:generate
```

```bash
npm run prisma:migrate
```
