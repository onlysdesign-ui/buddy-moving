# BuddyMoving Architecture

## High-level flow

```
User (browser)
   ↓
Vite/React frontend
   ↓  POST /analyze
Express backend
   ↓  /chat/completions
AI gateway
```

## Folder structure

- `frontend/` — Vite/React UI for submitting tasks and displaying analysis.
- `backend/` — Express API, serves static frontend build and calls the AI gateway.
- `docs/` — project documentation (this file, roadmap).
- `frontend_old/` — legacy frontend (not used in production).

## /analyze contract

**Request**
- `POST /analyze`
- JSON body:
  - `task` (string, required)
  - `context` (string, optional)

**Response (success)**
```json
{
  "analysis": {
    "audience": ["..."],
    "metrics": ["..."],
    "risks": ["..."],
    "questions": ["..."],
    "scenarios": ["..."],
    "approaches": ["..."]
  }
}
```

**Response (errors)**
- Missing `task` → `400 {"error":"task is required"}`
- AI not configured → `500 {"error":"AI is not configured (missing env vars)"}`
- AI call failures return `200` with a fallback `analysis` object (plus an `error`
  string when available) to keep the UI responsive.
