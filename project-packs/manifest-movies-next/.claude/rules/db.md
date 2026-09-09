---
paths: ["**/lib/db/**", "**/drizzle/**", "**/migrations/**", "**/schema/**"]
---
# Database — loads only when touching schema or migrations
- Flow: edit the Drizzle schema TS → `pnpm run db:generate` → review the SQL (add IF NOT EXISTS) → `pnpm run db:migrate`.
- NEVER the schema "push" command (a hook blocks it). Never hand-write a plain CREATE TABLE migration.
- Ask Larry before any schema change. Say which table, which column, and how to undo it.
- Prod DB (`ep-winter-butterfly`) is read-only for us. Dev DB is `ep-odd-rain`.
