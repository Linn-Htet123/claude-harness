---
paths: ["backend/**/*.py", "api/**/*.py", "**/*.go"]
---
# Backend — loads only when touching backend files
- Larry is still learning FastAPI and WebSockets: when you change them, explain in 2-3 simple lines with a real-life comparison.
- Typed request/response models at every API boundary (Pydantic / structs). No loose dicts.
- One place for retry / timeout / fallback policy. Do not copy it around.
