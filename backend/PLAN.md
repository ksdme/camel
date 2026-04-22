# AI-First Notes & Personal Assistant — Backend Plan

**Status:** Phase 1 shipped. Phase 2 in progress (authHandler, `/auth/me`, `/auth/logout` with cache-backed blocklist landed).
**Stack:** Encore.ts (TypeScript, Node 20+), **SQLite** via **Prisma**, Argon2id password hashing, JWT session tokens.
**Author:** Corey
**Date:** 2026-04-23

---

## Decisions locked in

| Decision | Choice | Notes |
|---|---|---|
| Database | **SQLite** | Local file `./prisma/dev.db`. Single-node only. |
| ORM | **Prisma** | Schema in `prisma/schema.prisma`, migrations in `prisma/migrations/`. |
| User primary key | **UUID** (string) | `@id @default(uuid())`. JWT `sub`, `getAuthData().userID`, and all response payloads carry the UUID as a string. |
| Password storage | **Argon2id** (OWASP 2024 baseline) | Per-user salt baked into the encoded hash. |
| Auth flow | **Single `/auth/login`** that does both signup and signin | If username doesn't exist → create + issue token. If it exists → verify password + issue token. |
| Tokens | **JWT (HS256)** access tokens, 7-day TTL for v1 | No refresh-token rotation in Phase 1. Will add in Phase 2. |
| Secret management | Encore Secrets (`JWT_SIGNING_SECRET`) | Local override via `.secrets.local.cue`. |

> **Caveat on combined login/signup:** This pattern (auto-create on first login) is convenient but has two known trade-offs we're explicitly accepting for v1:
> 1. **No user enumeration protection** — there's no "user already exists" path because every call returns success, so this side actually helps. But it also means a typo in the username on a returning user creates a brand-new account silently. We'll mitigate later with email verification (Phase 2).
> 2. **No explicit password-strength check during "signup"** — first-time login locks in whatever password is sent. Phase 1 enforces a minimum length only.

---

## Phases

Each phase ships independently. Tests + working endpoints required before moving on.

### Phase 1 — Auth foundation (shipped)

Goal: a working `/auth/login` that creates-or-authenticates a user and returns a JWT.

- [x] Add deps: `prisma`, `@prisma/client`, `argon2`, `jsonwebtoken`, `@types/jsonwebtoken`.
- [x] `prisma/schema.prisma` with `User` model (SQLite provider).
- [x] Initial migration wiring via `npm run init:db` (runs `prisma migrate dev --name init`).
- [x] `auth/db.ts` — single Prisma client instance.
- [x] `auth/password.ts` — Argon2id hash/verify wrapper.
- [x] `auth/tokens.ts` — JWT issue/verify, secret from Encore Secrets.
- [x] `auth/auth.ts` — `POST /auth/login` (combined signup+signin).
- [x] `auth/encore.service.ts` — service definition.
- [x] `scripts/init-secret.mjs` — auto-generates `.env` + `.secrets.local.cue` on `npm install`.
- [x] `auth/password.test.ts` — hash/verify roundtrip, wrong-password rejection, salt uniqueness.
- [ ] Vitest coverage for `tokens.ts` and the login endpoint (deferred to Phase 2 because both require the Encore test runner + DB provisioning, since `secret()` and Prisma need a live env).

### Phase 2 — Auth hardening (in progress)

- [x] `authHandler` (`auth/handler.ts`) + `Gateway` export — other services can now set `auth: true`.
- [x] `GET /auth/me` — protected test endpoint that returns the current user (exercises the authHandler end-to-end).
- [x] `POST /auth/logout` — JWT blocklist via Encore `CacheCluster` keyed by `jti`, TTL = remaining token lifetime. AuthData carries `jti`+`exp`; authHandler checks the blocklist after signature verification.
- [x] `query.http` — REST Client smoke-test suite covering login, /me, logout, revocation, validation failures, and re-login.
- [ ] Vitest coverage for `tokens.ts` + login endpoint + `/auth/me` + `/auth/logout` via `encore test`.
- [ ] Refresh-token rotation (separate `/auth/refresh`, HttpOnly cookie).
- [ ] Rate limiting on `/auth/*` (by IP and username).
- [ ] Account lockout after N failed attempts.
- [ ] `auth_events` audit log table + writes on every login attempt.
- [ ] Optional email field + email verification flow (closes the typo-creates-new-account hole).

### Phase 3 — Notes CRUD

- [ ] Prisma models: `Folder`, `Note`, `Tag`, `NoteTag`, `Attachment`.
- [ ] `notes` service with CRUD endpoints (all `auth: true`, all filtered by `userId`).
- [ ] Soft delete (`deletedAt`).
- [ ] SQLite FTS5 virtual table for search (raw SQL migration; Prisma doesn't model FTS).
- [ ] `GET /notes/search` over title+content.
- [ ] Pagination + filtering by folder/tag/archived.

### Phase 4 — AI assistant (no RAG)

- [ ] Prisma models: `Conversation`, `Message`.
- [ ] `assistant` service.
- [ ] `POST /assistant/chat` — streaming via Encore `streamOut`, Claude API client.
- [ ] `GET /assistant/conversations`.

### Phase 5 — RAG over user notes

- [ ] `NoteEmbedding` model (BLOB-packed `Float32Array` since SQLite has no vector type).
- [ ] Pub/Sub topic on note create/update → embedding job.
- [ ] In-process cosine similarity for small corpora; revisit `sqlite-vec` if dataset grows.
- [ ] Inject top-K chunks into chat context.

### Phase 6 — Assistant memory & summarization

- [ ] `UserAiMemory` model (preferences, facts, goals).
- [ ] `POST /assistant/summarize/:noteId`.
- [ ] Daily digest cron.

### Phase 7 — External interaction surfaces (per Agents.md)

- [ ] Public REST API surface (separate from internal endpoints).
- [ ] Telegram bot ingestion.
- [ ] Email-in (SMTP webhook → note).
- [ ] Slack integration.

---

## File layout (current)

```
backend/
├── encore.app
├── package.json
├── scripts/
│   └── init-secret.mjs             # bootstraps .env + .secrets.local.cue (postinstall)
├── prisma/
│   ├── schema.prisma
│   └── migrations/                 # generated by prisma migrate
├── auth/
│   ├── encore.service.ts
│   ├── auth.ts                     # POST /auth/login (combined)
│   ├── me.ts                       # GET /auth/me (protected)
│   ├── logout.ts                   # POST /auth/logout (Phase 2)
│   ├── handler.ts                  # authHandler + Gateway (Phase 2)
│   ├── cache.ts                    # tokenBlocklist keyspace (Phase 2)
│   ├── db.ts                       # Prisma client singleton
│   ├── password.ts                 # argon2id hash/verify
│   ├── password.test.ts
│   └── tokens.ts                   # JWT issue/verify (now with jti)
├── query.http                      # REST Client smoke tests
└── hello/                          # starter, leave for now
```

---

## Phase 1 — `/auth/login` contract

**Request**

```json
POST /auth/login
{
  "username": "corey",
  "password": "at-least-8-characters"
}
```

Validation: `username` `MinLen<3> & MaxLen<32> & MatchesRegexp<"^[a-zA-Z0-9_]+$">`,
`password` `MinLen<8> & MaxLen<128>`.

**Behaviour**

1. Look up user by username.
2. If not found → hash password with Argon2id, insert user, issue JWT, return `{ token, user, created: true }`.
3. If found → Argon2id verify against stored hash.
   - On match → issue JWT, return `{ token, user, created: false }`.
   - On mismatch → `APIError.unauthenticated("invalid username or password")`.

**Response (200)**

```json
{
  "token": "<jwt>",
  "user": {
    "id": "9f2c1e7a-1e6e-4b62-9b6b-3a6f3b8d5e21",
    "username": "corey",
    "createdAt": "..."
  },
  "created": true
}
```

JWT payload: `{ sub: "<uuid>", jti: "<random>", iat, exp }`. TTL 7 days. HS256, signed with `JWT_SIGNING_SECRET`. The authHandler exposes `{ userID, jti, exp }` via `getAuthData()`.

---

## Phase 1 — Setup commands

```bash
cd backend
npm install                          # postinstall auto-generates .env + .secrets.local.cue
npm run init                         # runs init-secret (idempotent) + prisma migrate dev --name init
encore run
```

The `postinstall` hook runs [`scripts/init-secret.mjs`](scripts/init-secret.mjs), which:
- Copies `.env.example` → `.env` if missing (so Prisma has `DATABASE_URL`).
- Writes `.secrets.local.cue` with `JWT_SIGNING_SECRET` of the form
  `<32-byte hex>+<cute-name>+salt+camel` if missing. Cute name is picked
  randomly from an in-script list (mochi, biscuit, pickle, …).
- Never overwrites existing files, so rerunning `npm install` is safe.

To force a new secret: delete `.secrets.local.cue` and run `npm run init:secret`.

**If you previously ran `npm run init:db` against the old INTEGER-id schema**, reset before re-running:

```bash
# Stop any `encore run` first so the SQLite file isn't held open.
rm prisma/dev.db                     # removes the stale dev DB
npm run init:db                      # regenerates the init migration with UUID
```

Smoke test:

```bash
# 1. First call creates the user, returns a JWT.
TOKEN=$(curl -s -X POST http://localhost:4000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"corey","password":"hunter2hunter2"}' | jq -r .token)

# 2. Hit the protected endpoint with the token.
curl -H "Authorization: Bearer $TOKEN" http://localhost:4000/auth/me

# 3. Hit /auth/me without a token → 401 Unauthenticated.
curl -i http://localhost:4000/auth/me

# 4. Wrong password on login → 401.
curl -i -X POST http://localhost:4000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"corey","password":"wrong"}'
```

---

## Open questions (to revisit before Phase 2)

1. **Email field on signup** — required, optional, or deferred entirely? Affects password reset.
2. **Password reset flow** — Phase 2 or later?
3. **2FA** — needed for v1 or post-launch?
4. **AI provider** — confirm Claude API via `@anthropic-ai/sdk`?
5. **At-rest note encryption** — defer per current recommendation, or revisit?
