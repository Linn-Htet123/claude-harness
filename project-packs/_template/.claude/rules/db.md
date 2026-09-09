---
paths: ["**/migrations/**", "**/schema/**", "**/lib/db/**", "**/drizzle/**", "**/prisma/**", "**/alembic/**"]
---
# Database — loads only when touching schema or migrations
- Flow: change the schema file → run the migration generator → review the SQL → run the migrate command from this repo's CLAUDE.md.
- NEVER a schema "push" command (a hook blocks it). Never hand-write a plain CREATE TABLE migration.
- Ask Larry before any schema change. Say which table, which column, and how to undo it.
- Production databases are read-only for us unless the ticket says otherwise.
