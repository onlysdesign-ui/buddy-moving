# Buddy Moving

Prototype skeleton for Buddy Moving.

## Backend запуск

```bash
cd backend
npm install
node server.js
```

### Backend с AI-анализом

Скопируйте пример окружения и добавьте ключ OpenAI:

```bash
cd backend
cp .env.example .env
```

Укажите `OPENAI_API_KEY` в `.env`. При необходимости можно задать модель через
`OPENAI_MODEL` (по умолчанию `gpt-4o-mini`).

> Примечание: GitHub Pages остаётся в режиме mock-only.

Проверка health:

```bash
curl http://localhost:3000/health
```

Проверка analyze:

```bash
curl -X POST http://localhost:3000/analyze \
  -H "Content-Type: application/json" \
  -d '{"task":"Improve onboarding","context":"Focus on new users"}'
```

## Frontend (React + Radix UI)

### Локальный запуск

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

`VITE_API_BASE` должен указывать на работающий backend (например,
`https://buddy-moving.onrender.com`).

### Сборка и публикация в GitHub Pages

```bash
cd frontend
npm install
npm run build
```

После сборки замените содержимое `docs/` артефактами из `frontend/dist`:

```bash
rm -rf ../docs
cp -R dist ../docs
```

GitHub Pages использует каталог `docs/` как корень и базовый путь
`/buddy-moving/`.
