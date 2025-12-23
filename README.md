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
