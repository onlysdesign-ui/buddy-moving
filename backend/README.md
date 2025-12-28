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
    "audience": "...",
    "metrics": "...",
    "risks": "...",
    "questions": "...",
    "scenarios": "...",
    "approaches": "..."
  }
}
```
