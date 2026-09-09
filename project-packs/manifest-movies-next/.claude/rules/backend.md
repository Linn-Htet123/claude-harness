---
paths: ["backend/**/*.py"]
---
# Backend (Python / FastAPI) — loads only when touching backend files
- Larry is still learning FastAPI and WebSockets: when you change them, explain the change in 2-3 simple lines with a real-life comparison.
- Pydantic models for every request/response. No untyped dicts across the API boundary.
- Becca prompt or conversation changes need Eric or Anthony sign-off before merge. Say this when you touch `becca_system/`.
- LiteLLM retry/fallback policy lives in one place (`model_resilience.py`). Do not copy it.
