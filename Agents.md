## camel

Camel is a agent based knowledge management system. AI agents are first class citizens on this app. While the user can edit the notes manually, the users are expected to interact with the agents more than the editor. The app is not the only mode of interaction with the system. There will be several external points of interaction like API, Telegram, Email, Slack etc. This should also be treated as core functionality and experience.

### Stack

Frontend
- TypeScript with Vite+
- React

Backend
- NodeJS with TypeScript
- Encore framework (https://encore.dev/)
- Prisma ORM

## Core Priorities

1. Performance first.
2. Reliability first.
3. Keep behavior predictable under load and during failures.

If a tradeoff is required, choose correctness and robustness over short-term convenience.

## Maintainability

Long term maintainability is a core priority. If you add new functionality, first check if there is shared logic that can be extracted to a separate module. Duplicate logic across multiple files is a code smell and should be avoided. Don't be afraid to change existing code. Don't take shortcuts by just adding local logic to solve a problem.
