const express = require("express");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const OpenAI = require("openai");

dotenv.config({ path: path.join(__dirname, ".env") });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const openaiClient = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

const app = express();
const port = process.env.PORT || 3000;

console.log("OPENAI_API_KEY:", OPENAI_API_KEY ? "set" : "missing");
console.log("OPENAI_MODEL:", OPENAI_MODEL);

// ------------------------------
// CORS (no deps)
// ------------------------------

// Разрешаем твой GitHub Pages + локальную разработку
const ALLOWED_ORIGINS = new Set([
  "https://onlysdesign-ui.github.io",
  "http://localhost:3000",
  "http://localhost:5173",
]);

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  // Разрешаем нужные методы и заголовки
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Если вдруг в будущем понадобится куки - можно включить:
  // res.setHeader("Access-Control-Allow-Credentials", "true");

  // Preflight запросы браузера (OPTIONS) должны возвращать 204
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

// ------------------------------
// Middleware
// ------------------------------
app.use(express.json());

// ------------------------------
// Static dist fallback (optional)
// ------------------------------
const frontendDistPath = path.join(__dirname, "../frontend/dist");
const rootDistPath = path.join(__dirname, "../dist");
const distPath = fs.existsSync(frontendDistPath) ? frontendDistPath : rootDistPath;
const indexPath = path.join(distPath, "index.html");

if (!fs.existsSync(indexPath)) {
  console.warn("⚠️ dist/index.html not found. Frontend is not built yet.");
  console.warn("Expected at:", indexPath);
}

app.use(express.static(distPath));

// ------------------------------
// OpenAI response parsing
// ------------------------------
const requiredAnalysisKeys = [
  "audience",
  "metrics",
  "risks",
  "questions",
  "scenarios",
  "approaches",
];

function extractJSONObject(text) {
  if (typeof text !== "string") return null;

  // Иногда бывают невидимые символы в начале
  const cleaned = text.trim().replace(/^\uFEFF/, "");

  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");

  if (first === -1 || last === -1 || last <= first) return null;

  return cleaned.slice(first, last + 1);
}

function parseAnalysisResponse(content) {
  const raw = typeof content === "string" ? content : "";

  // 1) Сначала пытаемся парсить как есть
  try {
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object") {
      throw new Error("OpenAI response was not a JSON object");
    }

    return validateAnalysis(parsed);
  } catch (e) {
    // 2) Если не получилось - попробуем вытащить JSON из строки
    const extracted = extractJSONObject(raw);

    if (!extracted) {
      // Логируем реальный ответ (обрезаем, чтобы не спамить)
      console.error("❌ OpenAI returned non-JSON content:", raw.slice(0, 1000));
      throw new Error("Failed to parse OpenAI JSON response (no JSON object found)");
    }

    try {
      const parsed = JSON.parse(extracted);
      return validateAnalysis(parsed);
    } catch (e2) {
      console.error("❌ OpenAI returned broken JSON:", extracted.slice(0, 1000));
      throw new Error("Failed to parse OpenAI JSON response (broken JSON)");
    }
  }
}

function validateAnalysis(parsed) {
  const analysis = {};

  for (const key of requiredAnalysisKeys) {
    const value = parsed[key];

    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`OpenAI response missing or invalid field: ${key}`);
    }

    analysis[key] = value.trim();
  }

  return analysis;
}


// ------------------------------
// Routes
// ------------------------------
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    ai: Boolean(openaiClient),
    model: OPENAI_MODEL || null,
  });
});

app.post("/analyze", async (req, res) => {
  try {
    const task = typeof req.body?.task === "string" ? req.body.task.trim() : "";
    const context =
      typeof req.body?.context === "string" ? req.body.context.trim() : "";

    if (!task) {
      return res.status(400).json({ error: "task is required" });
    }

    if (!openaiClient) {
      return res
        .status(500)
        .json({ error: "AI is not configured (missing env vars)" });
    }

const prompt = `
You are a senior product designer + product strategist.

Your job: help a designer quickly understand a task, uncover user intent, define success, identify risks, and propose research-ready approaches.

Return STRICT JSON only.
No markdown, no backticks, no explanations outside JSON.

IMPORTANT OUTPUT RULES:
- Output must be a single JSON object with EXACT keys:
  audience, metrics, risks, questions, scenarios, approaches
- Each value MUST be a concise, information-dense string.
- Use short paragraphs and bullet-like formatting inside the string (using "-" for bullets).
- Avoid vague language ("improve UX", "make it better"). Be concrete.
- Think like a designer preparing discovery + solution framing.

CONTEXT:
Task: ${task}
Context: ${context || "(none)"}

KEY SPECIFICATION (what each key MUST answer):

1) audience
Answer: "Who is the user and what jobs are they trying to get done?"
Include:
- Primary audience (who they are, their environment)
- Secondary audiences/stakeholders (if relevant)
- User goals + motivations (what they want to achieve)
- Pain points and constraints (time, skill, trust, device, context)
- Segments (2-3 meaningful segments: novice vs expert, B2B vs B2C, etc.)
- Non-users / excluded groups (who this is NOT for, if that matters)

2) metrics
Answer: "How do we measure success and whether the solution works?"
Include:
- Core success metric (North Star) tied to user value
- Supporting metrics (behavioral + outcome + quality)
- Guardrails (to avoid making it worse: errors, churn, complaints)
- Leading indicators (early signals)
- Instrumentation hints (what needs tracking)

Rules:
- Prefer measurable, observable metrics.
- Include baseline/target hints if possible (even qualitative targets).

3) risks
Answer: "What can go wrong and what could kill adoption or trust?"
Include:
- Product risks (wrong problem, unclear value, poor adoption)
- UX risks (confusion, cognitive load, edge cases)
- Trust & safety risks (misleading outputs, hallucinations, bias)
- Legal/compliance/privacy risks (PII, data retention)
- Technical risks (latency, reliability, cost)
- Stakeholder risks (misalignment, scope creep)

For each risk: state the risk + impact + mitigation idea.

4) questions
Answer: "What do we need to learn before building or shipping?"
Include:
- The most important unknowns (5-10)
- Questions for user research (needs, behaviors, current workarounds)
- Questions for feasibility (data, constraints, system behavior)
- Questions for business (who pays, why now, differentiation)
- Questions for AI behavior (accuracy, failure modes, acceptable errors)

Make questions actionable: they should be testable via interviews, prototypes, or analytics.

5) scenarios
Answer: "What are the key user flows and real-life situations we must support?"
Include:
- 3-6 scenarios with:
  - Trigger/context
  - User goal
  - Steps at a high level
  - Success outcome
  - Common failure case / edge case
- Include at least one:
  - happy path
  - stressful/urgent path
  - novice path
  - edge/failure path

6) approaches
Answer: "What are viable solution directions and how would we validate them?"
Include:
- 3-5 distinct solution approaches
- For each approach:
  - Concept in one line
  - Why it might work (insight)
  - What to prototype/test (MVP test)
  - Risks/tradeoffs
  - Complexity estimate (low/med/high)

Ensure approaches are meaningfully different (not just UI variations).
Prefer approaches that are testable quickly with prototypes.

Now produce the JSON object.
`.trim();

   const data = await openaiClient.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      {
        role: "system",
        content: [
          "You are a senior product designer + product strategist.",
          "Return STRICT JSON only. No markdown, no prose.",
          "Output must be a single JSON object with keys:",
          "audience, metrics, risks, questions, scenarios, approaches.",
          "Each value must be a concise string."
        ].join("\n")
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.4,
    max_tokens: 700,
    response_format: { type: "json_object" },
});

    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI response was empty");
    }
    
    console.log("🧠 OpenAI raw content:", String(content).slice(0, 1200));
    const analysis = parseAnalysisResponse(content);

    return res.json({ analysis });
  } catch (err) {
    console.error("OpenAI request failed:", err);

    // ВАЖНО: возвращаем детали, чтобы фронт мог показать ошибку,
    // а не только "Failed to fetch"
    return res.status(500).json({
      error: "OpenAI request failed",
      details: err?.message ? String(err.message) : String(err),
    });
  }
});

// ------------------------------
// SPA fallback (optional)
// ------------------------------
app.get("*", (req, res) => {
  if (!fs.existsSync(indexPath)) {
    return res.status(503).send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>BuddyMoving</title>
    <style>
      body {
        margin: 0;
        font-family: system-ui, -apple-system, Segoe UI, sans-serif;
        background: #0b0c10;
        color: #f5f5f6;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
      }
      main {
        max-width: 520px;
        padding: 32px;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.12);
      }
      h1 {
        margin: 0 0 12px;
        font-size: 1.4rem;
      }
      p {
        margin: 0;
        color: rgba(255, 255, 255, 0.75);
        line-height: 1.6;
      }
      code {
        display: inline-block;
        margin-top: 12px;
        padding: 6px 10px;
        background: rgba(0, 0, 0, 0.35);
        border-radius: 8px;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Frontend not built</h1>
      <p>Run the build to generate the Vite assets for BuddyMoving.</p>
      <code>npm run build</code>
    </main>
  </body>
</html>`);
  }
  res.sendFile(indexPath);
});

app.listen(port, () => {
  console.log(`Buddy Moving backend listening on port ${port}`);
});
