# BuddyMoving

## Вижн и основная идея

**Для кого:**
- продакт‑менеджеры, UX‑/CX‑дизайнеры, исследователи и команды, которым нужно быстро превратить неструктурный запрос в понятный план продуктовой проработки.

**Что делаем:**
- превращаем «сырое» описание задачи в структурированную продуктовую аналитическую выжимку с понятными блоками (problem framing, неизвестные, варианты решений, решение, план экспериментов, рабочий пакет).

**Главная фишка:**
- выводы каждого блока реально влияют на следующий, полностью повторяя логику дизайн‑процесса и выстраивая сквозную цепочку решений.

**Почему это лучше обычного чата с GPT:**
- BuddyMoving снимает туннелирование в одно решение и заставляет глубже анализировать задачу через обязательные этапы разборки, что снижает риск преждевременных выводов.

BuddyMoving — это продуктовый копилот, который берет описание задачи и контекст, обращается к OpenAI через Node/Express‑бэкенд и возвращает структурированный анализ. Фронтенд доступен как статическая страница (GitHub Pages, `docs/`) или как Vite‑приложение для локальной разработки.

**Вижн:**
- помогаем продуктологам проводить задачу по гипотезам и подсвечиваем то, что они могли упустить на каждом шаге.

**Для кого:**
- продакт‑менеджеры, UX‑/CX‑дизайнеры, исследователи и команды, которым нужно быстро превратить неструктурный запрос в понятный план продуктовой проработки.

---

## Основной функционал

- **Структурированный анализ задачи** по шести ключам:
  - `framing` — постановка проблемы и ограничений;
  - `unknowns` — неизвестные и риски;
  - `solution_space` — пространство решений;
  - `decision` — рекомендации и направления;
  - `experiment_plan` — план проверки гипотез;
  - `work_package` — план работ/следующие шаги.
- **Streaming‑режим (SSE):** можно получать блоки анализа постепенно.
- **Углубление отдельного блока:** запрос на детальную проработку одного ключа.
- **Проверка качества блока:** валидация и уточнение конкретного раздела анализа.

---

## Архитектура

- **Backend:** Node.js + Express (эндпоинты `/analyze`, `/analyze/stream`, `/analyze/deeper`, `/analyze/verify`).
- **Frontend:**
  - статический фронтенд в `docs/` (удобно для GitHub Pages);
  - опционально Vite‑фронтенд в `frontend/` для разработки.
- **Интеграция с LLM:** бэкенд формирует промпт и обращается к OpenAI API.

---

## Структура репозитория

```
.
├── backend/          # Node/Express API
├── docs/             # Статический фронтенд (GitHub Pages)
├── frontend/         # Vite‑фронтенд (dev + сборка)
└── README.md         # Эта документация
```

---

## Быстрый старт (локально)

### 1) Backend

```bash
cd backend
npm install
# Создайте backend/.env с ключами:
# OPENAI_API_KEY=...
# OPENAI_MODEL=gpt-4o-mini
node server.js
```

По умолчанию сервер стартует на `http://localhost:3000`.

### 2) Frontend (статическая версия)

```bash
cd docs
# Откройте index.html в браузере или поднимите простой static server
# Убедитесь, что API base в docs/app.js указывает на ваш backend.
```

### 3) Frontend (Vite, опционально)

```bash
cd frontend
npm install
# В frontend/.env задайте VITE_API_BASE=http://localhost:3000
npm run dev
```

---

## Переменные окружения

### Backend (`backend/.env`)
- `OPENAI_API_KEY` — ключ OpenAI API.
- `OPENAI_MODEL` — имя модели (по умолчанию `gpt-4o-mini`).

### Frontend (`frontend/.env`)
- `VITE_API_BASE` — базовый URL бэкенда.

---

## Деплой

### GitHub Pages (статическая версия)

**URL:** `https://<your-github-username>.github.io/buddy-moving/`

Vite base path уже настроен на `/buddy-moving/`.

**Опционально: backend API base**
- Задайте `VITE_API_BASE` во время сборки.
- Пример в `.github/workflows/deploy-pages.yml`:
  ```yaml
  - name: Build
    run: npm --prefix frontend run build
    env:
      VITE_API_BASE: https://your-backend.example.com
  ```

### Render

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
- `VITE_API_BASE` (если используете Vite‑фронтенд)
- `NPM_CONFIG_REGISTRY=https://registry.npmjs.org/`

---

## API (подробно)

### POST `/analyze`
- **Body:** `{ task, context }`
- **Response:** `{ analysis, language }`
- `language` определяется только по `task`.

**Пример:**
```bash
curl -X POST http://localhost:3000/analyze \
  -H "Content-Type: application/json" \
  -d '{"task":"Improve onboarding for new movers","context":"We have high drop-off after step 2."}'
```

### POST `/analyze/stream` (SSE)
- **Body:** `{ task, context, keys? }`
- **Response events:**
  - `event: key` → `{ key, value, status }`
  - `event: status` → `{ status, completed, total }`
  - `event: error` → `{ key, error, details }`
  - `event: done` → `{ status: "done" }`
- `language` в `status` определяется только по `task`.

**Пример:**
```bash
curl -N -H "Content-Type: application/json" \
  -d '{"task":"Design a moving assistant for renters","context":"Focus on students moving between dorms","keys":["framing","unknowns","solution_space","decision","experiment_plan","work_package"]}' \
  http://localhost:3000/analyze/stream
```

### POST `/analyze/deeper`
- **Body:** `{ task, context, key, currentAnalysis }`
- **Response:** `{ key, value, language }`

### POST `/analyze/verify`
- **Body:** `{ task, context, key, value, currentAnalysis }`
- **Response:** `{ key, value, language }`

---

## Troubleshooting

**“VITE_API_BASE is not configured”**
- Проверьте, что `frontend/.env` существует и содержит `VITE_API_BASE=...`.
- Перезапустите dev‑сервер.

**npm install 403 registry issue**
- Добавьте `.npmrc` в корень репозитория:
  ```
  registry=https://registry.npmjs.org/
  always-auth=false
  ```

---

## Примеры запросов к Render

```bash
curl -X POST https://buddy-moving.onrender.com/analyze \
  -H "Content-Type: application/json" \
  -d '{"task":"Reduce drop-off in the moving checklist","context":"Most users abandon after step 2."}'
```

```bash
curl -N -H "Content-Type: application/json" \
  -d '{"task":"Improve move planning for renters","context":"Focus on short-notice moves","keys":["framing","unknowns","solution_space","decision","experiment_plan","work_package"]}' \
  https://buddy-moving.onrender.com/analyze/stream
```
