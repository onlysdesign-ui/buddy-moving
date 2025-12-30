# BuddyMoving

BuddyMoving is a product-design copilot that turns a task description into a
structured analysis (audience, metrics, risks, questions, scenarios, and
approaches) by calling OpenAI from a lightweight Node/Express backend and
serving a static frontend (GitHub Pages) or the optional Vite build.

**Live demo (Render):** https://buddy-moving.onrender.com

## Deploy Frontend to GitHub Pages

**Pages URL:** `https://<your-github-username>.github.io/buddy-moving/`

The Vite base path is set to `/buddy-moving/` for GitHub Pages, so assets and routes load correctly from that subpath.

**Optional backend API base**
- Set `VITE_API_BASE` at build time if you want Pages to talk to a backend.
- Example in `.github/workflows/deploy-pages.yml`:
  ```yaml
  - name: Build
    run: npm --prefix frontend run build
    env:
      VITE_API_BASE: https://your-backend.example.com
  ```

## Local run (frontend + backend)

```bash
# Backend
cd backend
npm install
# Create backend/.env with:
# OPENAI_API_KEY=...
# OPENAI_MODEL=gpt-4o-mini
node server.js
```

```bash
# Frontend
cd docs
# Open index.html or serve this folder with a static server
# Ensure the API base in docs/app.js points to your backend.
```

**Optional Vite build:** If you use the Vite frontend, set `VITE_API_BASE` in
`frontend/.env` (e.g. http://localhost:3000) and run `npm install` + `npm run dev`
inside `frontend/`.

## Environment variables

Backend (`backend/.env`):
- `OPENAI_API_KEY` – OpenAI API key
- `OPENAI_MODEL` – model name (default: gpt-4o-mini)

Frontend (`frontend/.env`):
- `VITE_API_BASE` – backend base URL

## Render deployment

**Build command**
```bash
npm ci && npm run build
```

**Start command**
```bash
npm run start
```

**Environment variables (Render)**
- `OPENAI_API_KEY`, `OPENAI_MODEL`
- `VITE_API_BASE` (set to the Render URL of this service if using Vite)
- `NPM_CONFIG_REGISTRY=https://registry.npmjs.org/`

## Troubleshooting

**“VITE_API_BASE is not configured”**
- Ensure `frontend/.env` exists and contains `VITE_API_BASE=...`.
- Restart the dev server after changes.

**npm install 403 registry issue**
- Add a `.npmrc` in the repo root:
  ```
  registry=https://registry.npmjs.org/
  always-auth=false
  ```

## API endpoints

**POST `/analyze`**
- Body: `{ task, context }`
- Returns: `{ analysis, language }`
- `language` определяется только по `task`.

**POST `/analyze/stream` (SSE)**
- Body: `{ task, context }`
- Streams events:
  - `event: key` → `{ key, value, status }`
  - `event: status` → `{ status, completed, total }`
  - `event: error` → `{ key, error, details }`
  - `event: done` → `{ status: "done" }`
- `language` в `status` определяется только по `task`.

**POST `/analyze/deeper`**
- Body: `{ task, context, key, currentAnalysis }`
- Returns: `{ key, value, language }`
- `language` определяется только по `task`.

**POST `/analyze/verify`**
- Body: `{ task, context, key, value, currentAnalysis }`
- Returns: `{ key, value, language }`
- `language` определяется только по `task`.
