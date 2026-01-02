# Buddy Moving Backend

## Local development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file (see `.env.example`) and set your OpenAI key:

   ```bash
   OPENAI_API_KEY=your_key_here
   OPENAI_MODEL=gpt-4o-mini
   ```

3. Start the server:

   ```bash
   npm start
   ```

The server listens on `http://localhost:3000` by default.

## Test the analyze endpoint

```bash
curl -X POST http://localhost:3000/analyze \
  -H "Content-Type: application/json" \
  -d '{"task":"Improve onboarding for new movers","context":"We have high drop-off after step 2."}'
```

Expected response shape:

```json
{
  "analysis": {
    "framing": { "summary": "...", "full": "..." },
    "unknowns": { "summary": "...", "full": "..." },
    "solution_space": { "summary": "...", "full": "..." },
    "decision": { "summary": "...", "full": "..." },
    "experiment_plan": { "summary": "...", "full": "..." },
    "work_package": { "summary": "...", "full": "..." }
  }
}
```

## Test the analyze stream endpoint

```bash
curl -N -H "Content-Type: application/json" \
  -d '{"task":"Design a moving assistant for renters","context":"Focus on students moving between dorms","keys":["framing","unknowns","solution_space","decision","experiment_plan","work_package"]}' \
  http://localhost:3000/analyze/stream
```

## Render curl examples

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
