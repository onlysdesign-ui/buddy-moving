# Buddy Moving

Prototype skeleton for Buddy Moving.

## Backend запуск

```bash
cd backend
npm install
node server.js
```

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
