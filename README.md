# BuddyMoving

BuddyMoving is a product-design copilot that turns a task description into a
structured analysis (audience, metrics, risks, questions, scenarios, and
approaches) by calling an AI gateway from a lightweight Node/Express backend and
serving a Vite/React frontend.

**Live demo (Render):** https://buddy-moving.onrender.com

## Local run (frontend + backend)

```bash
# Backend
cd backend
npm install
# Create backend/.env with:
# AI_BASE_URL=...
# AI_API_KEY=...
# AI_MODEL=gpt-4o-mini
node server.js
```

```bash
# Frontend
cd frontend
cp .env.example .env
# Set VITE_API_BASE to your backend, e.g. http://localhost:3000
npm install
npm run dev
```

## Environment variables

Backend (`backend/.env`):
- `AI_BASE_URL` – base URL for the AI gateway (expects /chat/completions)
- `AI_API_KEY` – API key for the gateway
- `AI_MODEL` – model name (default: gpt-4o-mini)

Frontend (`frontend/.env`):
- `VITE_API_BASE` – backend base URL

## Render deployment

**Build command**
```bash
npm install && npm run build
```

**Start command**
```bash
npm run start
```

**Environment variables (Render)**
- `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`
- `VITE_API_BASE` (set to the Render URL of this service)

## Troubleshooting

**“VITE_API_BASE is not configured”**
- Ensure `frontend/.env` exists and contains `VITE_API_BASE=...`.
- Restart the dev server after changes.

**npm install 403 registry issue**
- Add a `.npmrc` in the repo root:
  ```
  registry=https://registry.npmjs.org/
  ```

**Cloudflare challenge / gateway blocks**
- The backend uses `curl` to avoid Cloudflare blocks, but if you still see
  “Cloudflare challenge” errors, confirm the gateway allows server-to-server
  access and that `AI_BASE_URL` points to the correct endpoint.
