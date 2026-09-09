---
paths: ["apps/becca/**/*.tsx", "apps/becca/**/*.ts", "apps/dashboard/**/*.tsx", "apps/dashboard/**/*.ts", "packages/becca-core/**"]
---
# Frontend (Next.js / TypeScript) — loads only when touching these files
- Shared Becca UI lives in `packages/becca-core`, not in the app (Tailwind purging drops app-side classes).
- Every new user-facing state needs a `data-testid` so @qa can find it.
- Test titles for spec scenarios: `S1 happy: ...`, `S2 edge: ...`.
- Figma is the UI source of truth (see root CLAUDE.md). Pull the screen before building it.
