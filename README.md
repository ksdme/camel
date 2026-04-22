# Camel

Camel is an agent-based knowledge management system. Agents are first-class citizens in the product, and the system is designed to support both the app UI and external interaction surfaces such as API, Telegram, email, and Slack.

The current repository contains the backend service built with Encore, TypeScript, Prisma, and SQLite.

## Stack

- Frontend: React + Vite
- Backend: Node.js + TypeScript + Encore
- Database: Prisma ORM + SQLite for local development

## Prerequisites

Install these tools before running the app:

- Node.js 20+
- npm
- Encore CLI

Install Encore:

- macOS: `brew install encoredev/tap/encore`
- Linux: `curl -L https://encore.dev/install.sh | bash`
- Windows PowerShell: `iwr https://encore.dev/install.ps1 | iex`

## Install

From the repository root:

```bash
cd backend
npm install
```

`npm install` runs the local secret bootstrap automatically. It creates `backend/.secrets.local.cue` if it does not already exist.

## Initialize Local Database

From `backend/`:

```bash
npm run init:db
```

If you are setting up the project for the first time, this is the simplest full setup flow:

```bash
cd backend
npm install
npm run init
```

## Run The App

From `backend/`:

```bash
encore run
```

When the dev server starts, the API is available at:

```text
http://127.0.0.1:4000
```

Encore also starts a local dashboard, usually at:

```text
http://127.0.0.1:9400
```

## Useful Commands

From `backend/`:

```bash
npm test
```

```bash
npm run prisma:migrate
```

```bash
npm run prisma:generate
```

## Current API

The backend currently includes:

- `POST /auth/login`
- `GET /auth/me`
- `POST /auth/logout`
- `GET /hello/:name`

Example login request:

```json
{
	"username": "C0oki3s",
	"password": "Password@0"
}
```

Use the returned JWT as a bearer token for protected routes:

```text
Authorization: Bearer <token>
```

## Project Layout

```text
camel/
├── README.md
└── backend/
		├── auth/
		├── hello/
		├── prisma/
		├── scripts/
		├── package.json
		└── encore.app
```

## Notes

- Local development uses SQLite via Prisma migrations.
- JWT signing secrets are loaded from `backend/.secrets.local.cue`.
- The backend README still contains some template material from the Encore starter; use this root README for the current project setup flow.
