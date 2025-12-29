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
    "framing": "...",
    "audience_focus": "...",
    "hypotheses": "...",
    "scenarios": "...",
    "success_criteria": "...",
    "options": "...",
    "recommendation": "..."
  }
}
```

## Test the analyze stream endpoint

```bash
curl -N -H "Content-Type: application/json" \
  -d '{"task":"Design a moving assistant for renters","context":"Focus on students moving between dorms","keys":["framing","audience_focus","hypotheses","scenarios","success_criteria","options","recommendation"]}' \
  http://localhost:3000/analyze/stream
```
