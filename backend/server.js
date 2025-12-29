const express = require("express");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const OpenAI = require("openai");

dotenv.config({ path: path.join(__dirname, ".env") });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS) || 30000;
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
// Analysis helpers
// ------------------------------
const analysisKeys = [
  "audience",
  "metrics",
  "risks",
  "questions",
  "scenarios",
  "approaches",
];

const keyInstructions = {
  audience: [
    "Answer: Who is the user and what jobs are they trying to get done?",
    "- Primary audience (who they are, their environment)",
    "- Secondary audiences/stakeholders (if relevant)",
    "- User goals + motivations (what they want to achieve)",
    "- Pain points and constraints (time, skill, trust, device, context)",
    "- Segments (2-3 meaningful segments: novice vs expert, B2B vs B2C, etc.)",
    "- Non-users / excluded groups (who this is NOT for, if that matters)",
  ].join("\n"),
  metrics: [
    "Answer: How do we measure success and whether the solution works?",
    "- Core success metric (North Star) tied to user value",
    "- Supporting metrics (behavioral + outcome + quality)",
    "- Guardrails (avoid making it worse: errors, churn, complaints)",
    "- Leading indicators (early signals)",
    "- Instrumentation hints (what needs tracking)",
    "Rules: Prefer measurable, observable metrics; include baseline/target hints.",
  ].join("\n"),
  risks: [
    "Answer: What can go wrong and what could kill adoption or trust?",
    "- Product risks (wrong problem, unclear value, poor adoption)",
    "- UX risks (confusion, cognitive load, edge cases)",
    "- Trust & safety risks (misleading outputs, hallucinations, bias)",
    "- Legal/compliance/privacy risks (PII, data retention)",
    "- Technical risks (latency, reliability, cost)",
    "- Stakeholder risks (misalignment, scope creep)",
    "For each risk: state the risk + impact + mitigation idea.",
  ].join("\n"),
  questions: [
    "Answer: What do we need to learn before building or shipping?",
    "- The most important unknowns (5-10)",
    "- Questions for user research (needs, behaviors, current workarounds)",
    "- Questions for feasibility (data, constraints, system behavior)",
    "- Questions for business (who pays, why now, differentiation)",
    "- Questions for AI behavior (accuracy, failure modes, acceptable errors)",
    "Make questions actionable: testable via interviews, prototypes, analytics.",
  ].join("\n"),
  scenarios: [
    "Answer: What are the key user flows and real-life situations we must support?",
    "- 3-6 scenarios with: Trigger/context, user goal, high-level steps, success outcome,",
    "  common failure case / edge case.",
    "- Include at least one: happy path, stressful/urgent path, novice path, edge/failure path.",
  ].join("\n"),
  approaches: [
    "Answer: What are viable solution directions and how would we validate them?",
    "- 3-5 distinct solution approaches",
    "- For each: concept in one line, why it might work (insight),",
    "  what to prototype/test (MVP test), risks/tradeoffs, complexity (low/med/high)",
    "Ensure approaches are meaningfully different and testable quickly.",
  ].join("\n"),
};

const languageLabels = {
  en: "English",
  ru: "Russian",
};

function detectLanguage(text) {
  const input = typeof text === "string" ? text : "";
  const cyrillicMatches = input.match(/[А-Яа-яЁё]/g) || [];
  const latinMatches = input.match(/[A-Za-z]/g) || [];
  const cyrillicCount = cyrillicMatches.length;
  const latinCount = latinMatches.length;
  const total = cyrillicCount + latinCount;

  if (total === 0) return "auto";

  const cyrillicRatio = cyrillicCount / total;
  if (cyrillicRatio >= 0.6) return "ru";
  if (cyrillicRatio <= 0.4) return "en";
  return "auto";
}

function resolveLanguage(text) {
  const detected = detectLanguage(text);
  if (detected !== "auto") return detected;

  const cyrillicCount = (text.match(/[А-Яа-яЁё]/g) || []).length;
  const latinCount = (text.match(/[A-Za-z]/g) || []).length;
  if (cyrillicCount > latinCount) return "ru";
  if (latinCount > cyrillicCount) return "en";
  return "en";
}

function buildKeyPrompt({ key, task, context, language }) {
  const languageLabel = languageLabels[language] || "English";
  return [
    "You are a senior product designer + product strategist.",
    `Respond only for the "${key}" section.`,
    `Write in ${languageLabel}.`,
    "Use short paragraphs and bullet-like formatting inside the response (use '-' for bullets).",
    "Avoid vague language; be concrete and actionable.",
    "",
    "TASK:",
    task,
    "",
    "CONTEXT:",
    context || "(none)",
    "",
    "KEY SPECIFICATION:",
    keyInstructions[key],
  ].join("\n");
}

function buildContextSummary(currentAnalysis, keyToSkip) {
  if (!currentAnalysis || typeof currentAnalysis !== "object") {
    return "(none)";
  }

  const lines = analysisKeys
    .filter((key) => key !== keyToSkip)
    .map((key) => {
      const value = currentAnalysis[key];
      if (!value || typeof value !== "string") return null;
      return `${key}: ${value}`;
    })
    .filter(Boolean);

  return lines.length ? lines.join("\n") : "(none)";
}

async function runWithTimeout(fn, { timeoutMs = OPENAI_TIMEOUT_MS, label, signal }) {
  const controller = new AbortController();
  const timeoutError = new Error(
    `${label || "OpenAI request"} timed out after ${timeoutMs}ms`
  );
  timeoutError.name = "TimeoutError";

  const abortHandler = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener("abort", abortHandler, { once: true });
    }
  }

  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(timeoutError);
    }, timeoutMs);
  });

  const requestPromise = fn(controller.signal);

  try {
    return await Promise.race([requestPromise, timeoutPromise]);
  } catch (error) {
    if (error?.name === "AbortError") {
      const abortError = new Error(`${label || "OpenAI request"} aborted`);
      abortError.name = "AbortError";
      throw abortError;
    }
    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    if (signal) {
      signal.removeEventListener("abort", abortHandler);
    }
  }
}

function logOpenAIError(key, err) {
  const status = err?.status;
  const code = err?.code;
  const message = err?.message;
  const errorMessage = err?.error?.message;
  console.error("OpenAI error", {
    key,
    status,
    code,
    message,
    errorMessage,
  });
}

async function runKeyCompletion({ key, task, context, language, signal }) {
  const prompt = buildKeyPrompt({ key, task, context, language });
  let response;
  try {
    response = await runWithTimeout(
      (signal) =>
        openaiClient.chat.completions.create(
          {
            model: OPENAI_MODEL,
            messages: [
              {
                role: "system",
                content: [
                  "You are a senior product designer + product strategist.",
                  "Respond with plain text only. No JSON, no markdown headers.",
                ].join("\n"),
              },
              { role: "user", content: prompt },
            ],
            temperature: 0.4,
            max_tokens: 450,
          },
          { signal }
        ),
      { label: `OpenAI ${key} request`, signal }
    );
  } catch (error) {
    logOpenAIError(key, error);
    throw error;
  }

  const content = response?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    console.error("❌ OpenAI returned empty content for key:", key);
    throw new Error("OpenAI response was empty");
  }

  return content.trim();
}

async function runDeeper({ key, task, context, language, currentAnalysis, signal }) {
  const otherContext = buildContextSummary(currentAnalysis, key);
  const prompt = [
    "You are a senior product designer + product strategist.",
    `Write a deeper, more detailed version of the "${key}" analysis.`,
    `Write in ${languageLabels[language] || "English"}.`,
    "Stay consistent with the current analysis for the other keys.",
    "Use short paragraphs and bullet-like formatting (use '-' for bullets).",
    "Avoid vague abstractions; be concrete and actionable.",
    "",
    "TASK:",
    task,
    "",
    "CONTEXT:",
    context || "(none)",
    "",
    "CURRENT ANALYSIS FOR OTHER KEYS:",
    otherContext,
    "",
    "CURRENT VERSION TO EXPAND:",
    currentAnalysis?.[key] || "(none)",
    "",
    "KEY SPECIFICATION:",
    keyInstructions[key],
  ].join("\n");

  let response;
  try {
    response = await runWithTimeout(
      (signal) =>
        openaiClient.chat.completions.create(
          {
            model: OPENAI_MODEL,
            messages: [
              {
                role: "system",
                content:
                  "Respond with plain text only. No JSON, no markdown headers, no extra labels.",
              },
              { role: "user", content: prompt },
            ],
            temperature: 0.45,
            max_tokens: 500,
          },
          { signal }
        ),
      { label: `OpenAI deeper ${key} request`, signal }
    );
  } catch (error) {
    logOpenAIError(key, error);
    throw error;
  }

  const content = response?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    console.error("❌ OpenAI returned empty content for deeper:", key);
    throw new Error("OpenAI response was empty");
  }

  return content.trim();
}

async function runVerify({ key, task, context, language, currentAnalysis, value, signal }) {
  const otherContext = buildContextSummary(currentAnalysis, key);
  const prompt = [
    "You are a senior product designer + product strategist.",
    `Rewrite the "${key}" analysis to be more realistic and grounded.`,
    `Write in ${languageLabels[language] || "English"}.`,
    "Re-check realism, remove abstractions, add concrete constraints and assumptions.",
    "Use short paragraphs and bullet-like formatting (use '-' for bullets).",
    "Stay consistent with the other keys.",
    "",
    "TASK:",
    task,
    "",
    "CONTEXT:",
    context || "(none)",
    "",
    "CURRENT ANALYSIS FOR OTHER KEYS:",
    otherContext,
    "",
    "CURRENT VALUE TO REWRITE:",
    value || currentAnalysis?.[key] || "(none)",
    "",
    "KEY SPECIFICATION:",
    keyInstructions[key],
  ].join("\n");

  let response;
  try {
    response = await runWithTimeout(
      (signal) =>
        openaiClient.chat.completions.create(
          {
            model: OPENAI_MODEL,
            messages: [
              {
                role: "system",
                content:
                  "Respond with plain text only. No JSON, no markdown headers, no extra labels.",
              },
              { role: "user", content: prompt },
            ],
            temperature: 0.45,
            max_tokens: 500,
          },
          { signal }
        ),
      { label: `OpenAI verify ${key} request`, signal }
    );
  } catch (error) {
    logOpenAIError(key, error);
    throw error;
  }

  const content = response?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    console.error("❌ OpenAI returned empty content for verify:", key);
    throw new Error("OpenAI response was empty");
  }

  return content.trim();
}

function writeSseEvent(res, event, data) {
  const payload = typeof data === "string" ? data : JSON.stringify(data);
  res.write(`event: ${event}\n`);
  res.write(`data: ${payload}\n\n`);
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

    const language = resolveLanguage(`${task} ${context}`);
    const analysis = {};

    for (const key of analysisKeys) {
      analysis[key] = await runKeyCompletion({ key, task, context, language });
    }

    return res.json({ analysis, language });
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

app.post("/analyze/stream", async (req, res) => {
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

  const language = resolveLanguage(`${task} ${context}`);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  let closed = false;
  const streamAbortController = new AbortController();
  let heartbeatId;
  req.on("close", () => {
    closed = true;
    streamAbortController.abort();
    if (heartbeatId) {
      clearInterval(heartbeatId);
    }
  });

  heartbeatId = setInterval(() => {
    if (!closed) {
      res.write(": ping\n\n");
    }
  }, 12000);

  writeSseEvent(res, "status", {
    status: "started",
    total: analysisKeys.length,
    language,
  });

  let completed = 0;
  try {
    for (const key of analysisKeys) {
      if (closed) break;
      console.log(`[stream] start key=${key}`);
      writeSseEvent(res, "status", {
        status: "key-start",
        key,
        completed,
        total: analysisKeys.length,
      });
      try {
        const value = await runKeyCompletion({
          key,
          task,
          context,
          language,
          signal: streamAbortController.signal,
        });
        writeSseEvent(res, "key", { key, value, status: "ok" });
        console.log(`[stream] done key=${key} ok`);
      } catch (error) {
        if (closed) break;
        const details = error?.message ? String(error.message) : String(error);
        console.error(`OpenAI request failed for ${key}:`, error);
        writeSseEvent(res, "error", {
          key,
          error: "OpenAI request failed",
          details,
        });
        console.log(`[stream] done key=${key} error=${details}`);
      } finally {
        if (closed) break;
        completed += 1;
        writeSseEvent(res, "status", {
          status: "progress",
          completed,
          total: analysisKeys.length,
        });
      }
    }
  } finally {
    clearInterval(heartbeatId);
    if (!closed) {
      writeSseEvent(res, "done", { status: "done" });
      res.end();
    }
  }
});

app.post("/analyze/deeper", async (req, res) => {
  try {
    const task = typeof req.body?.task === "string" ? req.body.task.trim() : "";
    const context =
      typeof req.body?.context === "string" ? req.body.context.trim() : "";
    const key = typeof req.body?.key === "string" ? req.body.key.trim() : "";
    const currentAnalysis =
      typeof req.body?.currentAnalysis === "object"
        ? req.body.currentAnalysis
        : null;

    if (!task) {
      return res.status(400).json({ error: "task is required" });
    }

    if (!analysisKeys.includes(key)) {
      return res.status(400).json({ error: "key is invalid" });
    }

    if (!openaiClient) {
      return res
        .status(500)
        .json({ error: "AI is not configured (missing env vars)" });
    }

    const language = resolveLanguage(`${task} ${context}`);
    const value = await runDeeper({
      key,
      task,
      context,
      language,
      currentAnalysis,
    });

    return res.json({ key, value, language });
  } catch (err) {
    console.error("OpenAI request failed:", err);
    return res.status(500).json({
      error: "OpenAI request failed",
      details: err?.message ? String(err.message) : String(err),
    });
  }
});

app.post("/analyze/verify", async (req, res) => {
  try {
    const task = typeof req.body?.task === "string" ? req.body.task.trim() : "";
    const context =
      typeof req.body?.context === "string" ? req.body.context.trim() : "";
    const key = typeof req.body?.key === "string" ? req.body.key.trim() : "";
    const value =
      typeof req.body?.value === "string" ? req.body.value.trim() : "";
    const currentAnalysis =
      typeof req.body?.currentAnalysis === "object"
        ? req.body.currentAnalysis
        : null;

    if (!task) {
      return res.status(400).json({ error: "task is required" });
    }

    if (!analysisKeys.includes(key)) {
      return res.status(400).json({ error: "key is invalid" });
    }

    if (!openaiClient) {
      return res
        .status(500)
        .json({ error: "AI is not configured (missing env vars)" });
    }

    const language = resolveLanguage(`${task} ${context}`);
    const updatedValue = await runVerify({
      key,
      task,
      context,
      language,
      currentAnalysis,
      value,
    });

    return res.json({ key, value: updatedValue, language });
  } catch (err) {
    console.error("OpenAI request failed:", err);
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
