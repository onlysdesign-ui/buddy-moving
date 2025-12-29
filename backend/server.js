const express = require("express");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const OpenAI = require("openai");

dotenv.config({ path: path.join(__dirname, ".env") });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS) || 30000;
const STRICT_MODE = process.env.STRICT_MODE === "true";
const OPENAI_TEMPERATURE = Number(process.env.OPENAI_TEMPERATURE ?? 0.45);
const TOKENS_KEY_COMPLETION = Number(process.env.TOKENS_KEY_COMPLETION ?? 800);
const TOKENS_DEEPER = Number(process.env.TOKENS_DEEPER ?? 1100);
const TOKENS_VERIFY = Number(process.env.TOKENS_VERIFY ?? 1100);
const openaiClient = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;
const {
  configureCaseFileUpdater,
  createEmptyCaseFile,
  updateCaseFile,
} = require("./caseFile/updateCaseFile");

const app = express();
const port = process.env.PORT || 3000;

console.log("OPENAI_API_KEY:", OPENAI_API_KEY ? "set" : "missing");
console.log("OPENAI_MODEL:", OPENAI_MODEL);
console.log("STRICT_MODE:", STRICT_MODE);
console.log("OPENAI_TEMPERATURE:", OPENAI_TEMPERATURE);
console.log("TOKENS_KEY_COMPLETION:", TOKENS_KEY_COMPLETION);
console.log("TOKENS_DEEPER:", TOKENS_DEEPER);
console.log("TOKENS_VERIFY:", TOKENS_VERIFY);

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
  "framing",
  "audience_focus",
  "hypotheses",
  "scenarios",
  "success_criteria",
  "options",
  "recommendation",
];

const keyInstructions = {
  framing: [
    "Output format:",
    "### Problem",
    "- <1-2 sentences>",
    "",
    "### Desired outcome",
    "- <1 sentence>",
    "",
    "### Non-goals",
    "- <3-5 bullets>",
    "",
    "### Assumptions",
    "- Assumption (confidence): <text> - Impact: <impact>",
    "(3-5 items)",
    "",
    "### Decision trail",
    "- Inputs used: <2-3 bullets from task/context/case file>",
    "- Key uncertainties: <1-2 bullets>",
    "- Why this framing (vs another plausible framing): <1-2 bullets>",
    "- Trade-offs of this framing: <1-2 bullets>",
  ].join("\n"),
  audience_focus: [
    "Output format:",
    "### Possible segments",
    "- Segment A: <who> - Main need: <need>",
    "- Segment B: <who> - Main need: <need>",
    "- Segment C: <who> - Main need: <need>",
    "",
    "### Primary focus",
    "- Chosen: Segment <A/B/C> (<confidence>)",
    "- Why this is primary:",
    "  - <3 bullets>",
    "",
    "### Primary segment details",
    "- Who: ...",
    "- Goals:",
    "  - <3 bullets>",
    "- Pains:",
    "  - <3 bullets>",
    "- Triggers:",
    "  - <2-3 bullets>",
    "",
    "### Decision trail",
    "- Inputs used: <2-3 bullets from task/context/case file>",
    "- Key uncertainties: <1-2 bullets>",
    "- Why this focus (vs another plausible focus): <1-2 bullets>",
    "- Trade-offs: <1-2 bullets>",
  ].join("\n"),
  hypotheses: [
    "Output format:",
    "### Hypotheses for the primary segment",
    "- (confidence) If we <do X>, then <Y>, because <Z>. Depends on: <assumption/constraint>. How we test: <fast test>",
    "(5-7 items)",
    "",
    "### What these hypotheses optimize for",
    "- <3 bullets>",
    "",
    "### Decision trail",
    "- Inputs used: <2-3 bullets from task/context/case file>",
    "- Options considered: <2-3 bullets>",
    "- Rejected: <1-2 bullets + why>",
    "- Chosen: <1 bullet + why>",
    "- Trade-offs accepted: <1-2 bullets>",
  ].join("\n"),
  scenarios: [
    "Output format:",
    "### Key scenarios (primary segment)",
    "1) <scenario name>",
    "- Intent: <1 sentence>",
    "- Entry point: <where/when/how they start>",
    "- Steps:",
    "  1. ...",
    "  2. ...",
    "  3. ...",
    "- Success criteria:",
    "  - <2-3 bullets>",
    "- Drop-off risks:",
    "  - <2-3 bullets>",
    "",
    "(3-5 scenarios)",
    "",
    "### Moment of truth",
    "- <1 sentence> + why",
    "",
    "### Decision trail",
    "- Inputs used: <2-3 bullets from task/context/case file>",
    "- Options considered: <2-3 bullets>",
    "- Rejected: <1-2 bullets + why>",
    "- Chosen: <1 bullet + why>",
    "- Trade-offs accepted: <1-2 bullets>",
  ].join("\n"),
  success_criteria: [
    "Output format:",
    "### Must-have success criteria",
    "- MUST: <criterion> - Measure later: <how>",
    "(2-3)",
    "",
    "### Should-have success criteria",
    "- SHOULD: <criterion> - Measure later: <how>",
    "(3-5)",
    "",
    "### Targets (qualitative)",
    "- Target (qualitative): <increase/decrease/maintain> - Why this direction",
    "- If estimating, label as 'estimate' and explain dependency",
    "",
    "### Guardrails",
    "- <risk to avoid> - How we monitor",
    "",
    "### Decision trail",
    "- Inputs used: <2-3 bullets from task/context/case file>",
    "- Options considered: <2-3 bullets>",
    "- Rejected: <1-2 bullets + why>",
    "- Chosen: <1 bullet + why>",
    "- Trade-offs accepted: <1-2 bullets>",
  ].join("\n"),
  options: [
    "Output format:",
    "MUST produce exactly 2 options: Option A and Option B. Do not include Option C unless explicitly requested.",
    "Option A and B must differ by core approach/mechanic. If they are similar, merge and create a real alternative.",
    "Each option must include trade-offs and risks, and must not reuse the same mechanic.",
    "### Option A (recommended direction)",
    "- What it is: <2 sentences>",
    "- Core mechanic: <mechanism>",
    "- Where it lives in UI: <surface>",
    "- Complexity estimate: <S/M/L>",
    "- Why it works for the primary segment:",
    "  - <3-5 bullets>",
    "- Trade-offs:",
    "  - <3 bullets>",
    "- Risks created:",
    "  - <2-3 bullets>",
    "- What we will NOT do:",
    "  - <2-3 bullets>",
    "",
    "### Option B (alternative)",
    "- What it is: <2 sentences>",
    "- Core mechanic: <mechanism>",
    "- Where it lives in UI: <surface>",
    "- Complexity estimate: <S/M/L>",
    "- Why it works for the primary segment:",
    "  - <2-4 bullets>",
    "- Trade-offs:",
    "  - <2-3 bullets>",
    "- Risks created:",
    "  - <2-3 bullets>",
    "- What we will NOT do:",
    "  - <2-3 bullets>",
    "",
    "### Decision trail",
    "- Inputs used: <2-3 bullets from task/context/case file>",
    "- Options considered: <2-3 bullets>",
    "- Rejected: <1-2 bullets + why>",
    "- Chosen: <1 bullet + why>",
    "- Trade-offs accepted: <1-2 bullets>",
  ].join("\n"),
  recommendation: [
    "Output format:",
    "### Recommendation",
    "- Choose: Option <A/B/C>",
    "- Why:",
    "  - <3-6 bullets>",
    "",
    "### Why not Option B",
    "- <3 bullets: concrete reasons>",
    "",
    "### MVP scope (2 weeks)",
    "- Build: <what we ship>",
    "- Do NOT build yet: <what we defer>",
    "- What the designer designs next: <next design task>",
    "",
    "### Trade-offs we accept",
    "- <3 bullets>",
    "",
    "### First week plan",
    "- Day 1-2: <actions>",
    "- Day 3-4: <actions>",
    "- Day 5-7: <actions>",
    "",
    "### First validation steps",
    "- <3-5 bullets>",
    "",
    "### If our assumptions are wrong",
    "- <2-3 bullets>",
    "",
    "### Decision trail",
    "- Inputs used: <2-3 bullets from task/context/case file>",
    "- Options considered: <2-3 bullets>",
    "- Rejected: <1-2 bullets + why>",
    "- Chosen: <1 bullet + why>",
    "- Trade-offs accepted: <1-2 bullets>",
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

function buildKeyPrompt({ key, task, context, language, caseFile }) {
  const languageLabel = languageLabels[language] || "English";
  const serializedCaseFile = caseFile ? JSON.stringify(caseFile) : null;
  const primaryFocusKeys = new Set([
    "hypotheses",
    "scenarios",
    "success_criteria",
    "options",
    "recommendation",
  ]);
  return [
    "You are a senior product designer + product thinker.",
    `Respond only for the "${key}" section.`,
    `Write in ${languageLabel}.`,
    "You must NOT ask the user questions.",
    "Be decision-grade: write like you're accountable for shipping this.",
    "Never write generic claims without: (mechanism → UI element → expected user behavior).",
    "If you use generic words like 'engagement', 'improve UX', 'increase interest', immediately follow with (mechanism → UI element → user behavior).",
    "You must make trade-offs: pick 1–2 best bets and explicitly say why others are worse.",
    "You must include constraints, failure modes, and guardrails.",
    "Always include a short 'Decision trail' section: Inputs used → Options considered → Rejected → Chosen → Trade-offs.",
    "Decision trail must be 4–8 bullets max. It must show what you rejected and why.",
    "ANTI-REPHRASE: Do not restate the same idea in different words. Each bullet must add a new constraint, mechanism, UI detail, risk, or test.",
    "NUMBERS RULE: Do NOT invent numeric targets or % deltas. Only use numbers if explicitly provided by the user/context. Otherwise keep it qualitative.",
    "Do NOT invent budgets or exact timelines.",
    "If information is missing, use Assumption (confidence): ... - Impact: ... - How to validate: ...",
    "Keep output structured with markdown headings starting with '###'.",
    "Use '-' for bullets only. Use '1.' '2.' for ordered steps.",
    STRICT_MODE
      ? "ANTI-FLUFF CHECK: If a sentence could fit any product, rewrite it with specifics."
      : null,
    STRICT_MODE
      ? "Write at least 2 concrete examples in the section (unless the format prevents it)."
      : null,
    "Be concrete and specific.",
    "No rephrasing: do not restate the same idea using different words. Each bullet must add a new constraint, mechanism, or UI detail.",
    "Use the Case File to stay consistent. Avoid introducing new entities unless needed.",
    "Use the existing primary_focus and assumptions if present. Do not change them unless framing/audience_focus.",
    primaryFocusKeys.has(key)
      ? "Base the analysis on primary_focus. If primary_focus is missing, pick one and mark it as Assumption (confidence) before using it."
      : null,
    "Secondary segments should be brief; go deep only on the primary focus.",
    "",
    "TASK:",
    task,
    "",
    "CONTEXT:",
    context || "(none)",
    "",
    "CASE FILE (JSON):",
    serializedCaseFile || "(none)",
    "",
    "KEY SPECIFICATION:",
    keyInstructions[key],
  ]
    .filter(Boolean)
    .join("\n");
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

function appendDebugLine(value, caseFile) {
  if (process.env.DEBUG_CASEFILE !== "true") {
    return value;
  }
  const safeCaseFile = caseFile || createEmptyCaseFile();
  const primaryFocus = safeCaseFile?.primary_focus?.segment || "";
  const assumptionsCount = Array.isArray(safeCaseFile?.assumptions)
    ? safeCaseFile.assumptions.length
    : 0;
  const hypothesesCount = Array.isArray(safeCaseFile?.hypotheses)
    ? safeCaseFile.hypotheses.length
    : 0;
  const scenariosCount = Array.isArray(safeCaseFile?.scenarios)
    ? safeCaseFile.scenarios.length
    : 0;
  return `${value}\n[debug] primary_focus="${primaryFocus}" | assumptions=${assumptionsCount} | hypotheses=${hypothesesCount} | scenarios=${scenariosCount}`;
}

async function runWithTimeout(label, timeoutMs, fn, { signal } = {}) {
  const resolvedTimeoutMs = timeoutMs ?? OPENAI_TIMEOUT_MS;
  const controller = new AbortController();
  const requestLabel = label || "OpenAI request";
  const timeoutError = new Error(
    `${requestLabel} timed out after ${resolvedTimeoutMs}ms`
  );
  timeoutError.name = "TimeoutError";

  const abortHandler = () => {
    console.warn(`[timeout] abort requested label=${requestLabel}`);
    controller.abort();
  };
  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener("abort", abortHandler, { once: true });
    }
  }

  let timeoutId;
  let hardTimeoutId;
  const startTime = Date.now();
  const hardTimeoutMs = resolvedTimeoutMs + 1000;
  console.log(
    `[timeout] start label=${requestLabel} timeoutMs=${resolvedTimeoutMs}`
  );

  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(() => {
      console.warn(
        `[timeout] soft-timeout label=${requestLabel} elapsedMs=${Date.now() - startTime}`
      );
      controller.abort();
      resolve({ ok: false, error: timeoutError, timedOut: true });
    }, resolvedTimeoutMs);
    timeoutId.unref?.();
  });

  const hardTimeoutPromise = new Promise((resolve) => {
    hardTimeoutId = setTimeout(() => {
      console.error(
        `[timeout] hard-timeout label=${requestLabel} elapsedMs=${Date.now() - startTime}`
      );
      controller.abort();
      resolve({ ok: false, error: timeoutError, timedOut: true, hardTimedOut: true });
    }, hardTimeoutMs);
    hardTimeoutId.unref?.();
  });

  const requestPromise = Promise.resolve()
    .then(() => fn(controller.signal))
    .then((value) => {
      console.log(
        `[timeout] success label=${requestLabel} elapsedMs=${Date.now() - startTime}`
      );
      return { ok: true, value };
    })
    .catch((error) => {
      if (error?.name === "AbortError") {
        const abortError = new Error(`${requestLabel} aborted`);
        abortError.name = "AbortError";
        console.warn(
          `[timeout] abort label=${requestLabel} elapsedMs=${Date.now() - startTime}`
        );
        return { ok: false, error: abortError, aborted: true };
      }
      return { ok: false, error };
    });

  try {
    return await Promise.race([requestPromise, timeoutPromise, hardTimeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    if (hardTimeoutId) {
      clearTimeout(hardTimeoutId);
    }
    if (signal) {
      signal.removeEventListener("abort", abortHandler);
    }
  }
}

configureCaseFileUpdater({
  client: openaiClient,
  model: OPENAI_MODEL,
  timeoutMs: OPENAI_TIMEOUT_MS,
  runWithTimeout,
});

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

async function runKeyCompletion({ key, task, context, language, caseFile, signal }) {
  const prompt = buildKeyPrompt({ key, task, context, language, caseFile });
  const startTime = Date.now();
  console.log(`[openai] start key=${key}`);
  let response;
  try {
    const result = await runWithTimeout(
      `OpenAI ${key} request`,
      OPENAI_TIMEOUT_MS,
      (signal) => {
        console.log(`[openai] signal.aborted=${signal.aborted} key=${key}`);
        if (signal.aborted) {
          throw new Error("Signal already aborted before request");
        }
        return openaiClient.chat.completions.create(
          {
            model: OPENAI_MODEL,
            messages: [
              {
                role: "system",
                content: [
                  "You are Buddy: a senior product designer + product strategist.",
                  "Your output must be decision-grade and actionable.",
                  "Avoid generic frameworks and filler text.",
                  "Always tie claims to: (mechanism → UI element → expected user behavior).",
                  "Always include trade-offs, failure modes, and guardrails.",
                  "Always include a short 'Decision trail' section: Inputs used → Options considered → Rejected → Chosen → Trade-offs.",
                  "Decision trail must be 4–8 bullets max. It must show what you rejected and why.",
                  "ANTI-REPHRASE: Do not restate the same idea in different words. Each bullet must add a new constraint, mechanism, UI detail, risk, or test.",
                  "NUMBERS RULE: Do NOT invent numeric targets or % deltas. Only use numbers if explicitly provided by the user/context. Otherwise keep it qualitative.",
                  "If info is missing, use Assumption (confidence) + Impact + How to validate (quick).",
                  "Respond with plain text only. Use markdown headings '###'. No JSON.",
                  STRICT_MODE
                    ? "ANTI-FLUFF: If a sentence could fit any product, rewrite it with specifics (UI, user action, constraint)."
                    : null,
                  STRICT_MODE
                    ? "Be opinionated: pick 1–2 best bets and explicitly reject weaker alternatives."
                    : null,
                ].join("\n"),
              },
              { role: "user", content: prompt },
            ],
            temperature: OPENAI_TEMPERATURE,
            max_tokens: TOKENS_KEY_COMPLETION,
          },
          { signal }
        );
      },
      { signal }
    );
    if (!result.ok) {
      throw result.error;
    }
    response = result.value;
  } catch (error) {
    logOpenAIError(key, error);
    console.log(`[openai] error key=${key} elapsedMs=${Date.now() - startTime}`);
    throw error;
  }
  console.log(`[openai] success key=${key} elapsedMs=${Date.now() - startTime}`);

  const content = response?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    console.error("❌ OpenAI returned empty content for key:", key);
    throw new Error("OpenAI response was empty");
  }

  return content.trim();
}

async function runDeeper({
  key,
  task,
  context,
  language,
  currentAnalysis,
  caseFile,
  signal,
}) {
  const otherContext = buildContextSummary(currentAnalysis, key);
  const serializedCaseFile = caseFile ? JSON.stringify(caseFile) : null;
  const prompt = [
    "You are a senior product designer + product thinker.",
    `Write a deeper, more detailed version of the "${key}" card.`,
    `Write in ${languageLabels[language] || "English"}.`,
    "You must NOT ask the user questions.",
    "Be decision-grade: write like you're accountable for shipping this.",
    "Never write generic claims without: (mechanism → UI element → expected user behavior).",
    "You must make trade-offs: pick 1–2 best bets and explicitly say why others are worse.",
    "You must include constraints, failure modes, and guardrails.",
    "Always include a short 'Decision trail' section: Inputs used → Options considered → Rejected → Chosen → Trade-offs.",
    "Decision trail must be 4–8 bullets max. It must show what you rejected and why.",
    "ANTI-REPHRASE: Do not restate the same idea in different words. Each bullet must add a new constraint, mechanism, UI detail, risk, or test.",
    "NUMBERS RULE: Do NOT invent numeric targets or % deltas. Only use numbers if explicitly provided by the user/context. Otherwise keep it qualitative.",
    "Do NOT invent budgets or exact timelines.",
    "If information is missing, use Assumption (confidence): ... - Impact: ... - How to validate: ...",
    "Stay consistent with the current analysis for the other keys.",
    "Use the existing primary_focus and assumptions if present. Do not change them unless framing/audience_focus.",
    "Use markdown headings starting with '###'.",
    "Use '-' for bullets only. Use '1.' '2.' for ordered steps.",
    STRICT_MODE
      ? "ANTI-FLUFF CHECK: If a sentence could fit any product, rewrite it with specifics."
      : null,
    STRICT_MODE
      ? "Write at least 2 concrete examples in the section (unless the format prevents it)."
      : null,
    "Be concrete and specific.",
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
    "CASE FILE (JSON):",
    serializedCaseFile || "(none)",
    "",
    "CURRENT VERSION TO EXPAND:",
    currentAnalysis?.[key] || "(none)",
    "",
    "KEY SPECIFICATION:",
    keyInstructions[key],
  ].join("\n");

  let response;
  try {
    const result = await runWithTimeout(
      `OpenAI deeper ${key} request`,
      OPENAI_TIMEOUT_MS,
      (signal) =>
        openaiClient.chat.completions.create(
          {
            model: OPENAI_MODEL,
            messages: [
              {
                role: "system",
                content: [
                  "You are Buddy: a senior product designer + product strategist.",
                  "Your output must be decision-grade and actionable.",
                  "Avoid generic frameworks and filler text.",
                  "Always tie claims to: (mechanism → UI element → expected user behavior).",
                  "Always include trade-offs, failure modes, and guardrails.",
                  "Always include a short 'Decision trail' section: Inputs used → Options considered → Rejected → Chosen → Trade-offs.",
                  "Decision trail must be 4–8 bullets max. It must show what you rejected and why.",
                  "ANTI-REPHRASE: Do not restate the same idea in different words. Each bullet must add a new constraint, mechanism, UI detail, risk, or test.",
                  "NUMBERS RULE: Do NOT invent numeric targets or % deltas. Only use numbers if explicitly provided by the user/context. Otherwise keep it qualitative.",
                  "If info is missing, use Assumption (confidence) + Impact + How to validate (quick).",
                  "Respond with plain text only. Use markdown headings '###'. No JSON.",
                  STRICT_MODE
                    ? "ANTI-FLUFF: If a sentence could fit any product, rewrite it with specifics (UI, user action, constraint)."
                    : null,
                  STRICT_MODE
                    ? "Be opinionated: pick 1–2 best bets and explicitly reject weaker alternatives."
                    : null,
                ]
                  .filter(Boolean)
                  .join("\n"),
              },
              { role: "user", content: prompt },
            ],
            temperature: Math.min(OPENAI_TEMPERATURE + 0.05, 0.65),
            max_tokens: TOKENS_DEEPER,
          },
          { signal }
        ),
      { signal }
    );
    if (!result.ok) {
      throw result.error;
    }
    response = result.value;
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

async function runVerify({
  key,
  task,
  context,
  language,
  currentAnalysis,
  value,
  caseFile,
  signal,
}) {
  const otherContext = buildContextSummary(currentAnalysis, key);
  const serializedCaseFile = caseFile ? JSON.stringify(caseFile) : null;
  const prompt = [
    "You are a senior product designer + product thinker.",
    `Rewrite the "${key}" card to be more realistic and grounded.`,
    `Write in ${languageLabels[language] || "English"}.`,
    "Re-check realism, remove abstractions, add concrete constraints and assumptions.",
    "You must NOT ask the user questions.",
    "Be decision-grade: write like you're accountable for shipping this.",
    "Never write generic claims without: (mechanism → UI element → expected user behavior).",
    "You must make trade-offs: pick 1–2 best bets and explicitly say why others are worse.",
    "You must include constraints, failure modes, and guardrails.",
    "Always include a short 'Decision trail' section: Inputs used → Options considered → Rejected → Chosen → Trade-offs.",
    "Decision trail must be 4–8 bullets max. It must show what you rejected and why.",
    "ANTI-REPHRASE: Do not restate the same idea in different words. Each bullet must add a new constraint, mechanism, UI detail, risk, or test.",
    "NUMBERS RULE: Do NOT invent numeric targets or % deltas. Only use numbers if explicitly provided by the user/context. Otherwise keep it qualitative.",
    "Do NOT invent budgets or exact timelines.",
    "If information is missing, use Assumption (confidence): ... - Impact: ... - How to validate: ...",
    "Use the existing primary_focus and assumptions if present. Do not change them unless framing/audience_focus.",
    "Use markdown headings starting with '###'.",
    "Use '-' for bullets only. Use '1.' '2.' for ordered steps.",
    STRICT_MODE
      ? "ANTI-FLUFF CHECK: If a sentence could fit any product, rewrite it with specifics."
      : null,
    STRICT_MODE
      ? "Write at least 2 concrete examples in the section (unless the format prevents it)."
      : null,
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
    "CASE FILE (JSON):",
    serializedCaseFile || "(none)",
    "",
    "CURRENT VALUE TO REWRITE:",
    value || currentAnalysis?.[key] || "(none)",
    "",
    "KEY SPECIFICATION:",
    keyInstructions[key],
  ].join("\n");

  let response;
  try {
    const result = await runWithTimeout(
      `OpenAI verify ${key} request`,
      OPENAI_TIMEOUT_MS,
      (signal) =>
        openaiClient.chat.completions.create(
          {
            model: OPENAI_MODEL,
            messages: [
              {
                role: "system",
                content: [
                  "You are Buddy: a senior product designer + product strategist.",
                  "Your output must be decision-grade and actionable.",
                  "Avoid generic frameworks and filler text.",
                  "Always tie claims to: (mechanism → UI element → expected user behavior).",
                  "Always include trade-offs, failure modes, and guardrails.",
                  "Always include a short 'Decision trail' section: Inputs used → Options considered → Rejected → Chosen → Trade-offs.",
                  "Decision trail must be 4–8 bullets max. It must show what you rejected and why.",
                  "ANTI-REPHRASE: Do not restate the same idea in different words. Each bullet must add a new constraint, mechanism, UI detail, risk, or test.",
                  "NUMBERS RULE: Do NOT invent numeric targets or % deltas. Only use numbers if explicitly provided by the user/context. Otherwise keep it qualitative.",
                  "If info is missing, use Assumption (confidence) + Impact + How to validate (quick).",
                  "Respond with plain text only. Use markdown headings '###'. No JSON.",
                  STRICT_MODE
                    ? "ANTI-FLUFF: If a sentence could fit any product, rewrite it with specifics (UI, user action, constraint)."
                    : null,
                  STRICT_MODE
                    ? "Be opinionated: pick 1–2 best bets and explicitly reject weaker alternatives."
                    : null,
                ]
                  .filter(Boolean)
                  .join("\n"),
              },
              { role: "user", content: prompt },
            ],
            temperature: Math.min(OPENAI_TEMPERATURE + 0.05, 0.65),
            max_tokens: TOKENS_VERIFY,
          },
          { signal }
        ),
      { signal }
    );
    if (!result.ok) {
      throw result.error;
    }
    response = result.value;
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
  res.flush?.();
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
    let caseFile = createEmptyCaseFile();

    for (const key of analysisKeys) {
      const value = await runKeyCompletion({
        key,
        task,
        context,
        language,
        caseFile,
      });
      let updatedCaseFile = caseFile;
      try {
        updatedCaseFile = await updateCaseFile(
          key,
          value,
          caseFile,
          task,
          context
        );
      } catch (updateError) {
        console.warn(`[casefile] update failed after ${key}:`, updateError);
      }
      caseFile = updatedCaseFile;
      analysis[key] = appendDebugLine(value, caseFile);
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
  const requestedKeys = Array.isArray(req.body?.keys)
    ? req.body.keys.filter((key) => analysisKeys.includes(key))
    : analysisKeys;
  const keysToAnalyze = requestedKeys.length ? requestedKeys : analysisKeys;

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

  let clientGone = false;
  const ping = setInterval(() => res.write(": ping\n\n"), 10000);
  res.on("close", () => {
    clientGone = true;
    clearInterval(ping);
  });

  writeSseEvent(res, "status", {
    status: "started",
    total: keysToAnalyze.length,
    language,
  });

  let completed = 0;
  let caseFile = createEmptyCaseFile();
  try {
    for (const key of keysToAnalyze) {
      if (clientGone) {
        return;
      }
      console.log(`[stream] start key=${key}`);
      writeSseEvent(res, "status", {
        status: "key-start",
        key,
        completed,
        total: keysToAnalyze.length,
      });
      try {
        const value = await runKeyCompletion({
          key,
          task,
          context,
          language,
          caseFile,
        });

        try {
          caseFile = await updateCaseFile(key, value, caseFile, task, context);
          if (process.env.NODE_ENV !== "production") {
            console.log(
              `[casefile] updated after ${key}: ${JSON.stringify(caseFile)}`
            );
          }
        } catch (updateError) {
          console.warn(`[casefile] update failed after ${key}:`, updateError);
        }

        const valueWithDebug = appendDebugLine(value, caseFile);
        writeSseEvent(res, "key", { key, value: valueWithDebug, status: "ok" });
        console.log(`[stream] done key=${key} ok`);
      } catch (error) {
        if (clientGone) {
          return;
        }
        const details = error?.message ? String(error.message) : String(error);
        console.error(`OpenAI request failed for ${key}:`, error);
        writeSseEvent(res, "error", {
          key,
          error: "OpenAI request failed",
          details,
        });
        console.log(`[stream] done key=${key} error=${details}`);
      } finally {
        if (clientGone) {
          return;
        }
        completed += 1;
        writeSseEvent(res, "status", {
          status: "progress",
          completed,
          total: keysToAnalyze.length,
        });
      }
    }
  } finally {
    clearInterval(ping);
    if (!clientGone) {
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
    const caseFile =
      typeof req.body?.caseFile === "object" && req.body.caseFile !== null
        ? req.body.caseFile
        : createEmptyCaseFile();

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
      caseFile,
    });

    return res.json({ key, value: appendDebugLine(value, caseFile), language });
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
    const caseFile =
      typeof req.body?.caseFile === "object" && req.body.caseFile !== null
        ? req.body.caseFile
        : createEmptyCaseFile();

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
      caseFile,
    });

    return res.json({
      key,
      value: appendDebugLine(updatedValue, caseFile),
      language,
    });
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
