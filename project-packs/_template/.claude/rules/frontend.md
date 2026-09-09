---
paths: ["src/**/*.tsx", "src/**/*.ts", "app/**/*.tsx", "app/**/*.ts", "components/**"]
---
# Frontend (TypeScript / React / Next.js) — loads only when touching these files
- Every new user-facing state gets a `data-testid` so @qa can find it.
- Test titles for spec scenarios: `S1 happy: ...`, `S2 edge: ...`.
- Prefer the design source (Figma / design doc) over guessing a layout.
