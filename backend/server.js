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
const TOKENS_DEEPER = Number(process.env.TOKENS_DEEPER ?? 1100);
const TOKENS_VERIFY = Number(process.env.TOKENS_VERIFY ?? 1100);
const KEY_COMPLETION_TEMPERATURE = 0.4;
const KEY_COMPLETION_MAX_TOKENS = 1100;
const openaiClient = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;
const {
  configureCaseFileUpdater,
  createEmptyCaseFile,
  updateCaseFile,
} = require("./caseFile/updateCaseFile");

const app = express();
const port = process.env.PORT || 3000;
const TEST_CASES_PATH = path.join(__dirname, "data", "testcases.json");
const FALLBACK_TEST_CASES_PATH = path.join(
  __dirname,
  "../frontend/src/tests/eval_cases_v2.json"
);

console.log("OPENAI_API_KEY:", OPENAI_API_KEY ? "set" : "missing");
console.log("OPENAI_MODEL:", OPENAI_MODEL);
console.log("STRICT_MODE:", STRICT_MODE);
console.log("OPENAI_TEMPERATURE:", OPENAI_TEMPERATURE);
console.log("TOKENS_DEEPER:", TOKENS_DEEPER);
console.log("TOKENS_VERIFY:", TOKENS_VERIFY);

// ------------------------------
// CORS (no deps)
// ------------------------------

// Разрешаем твой GitHub Pages + локальную разработку
const DEFAULT_ALLOWED_ORIGINS = [
  "https://onlysdesign-ui.github.io",
  "http://localhost:3000",
  "http://localhost:5173",
];
const extraAllowedOrigins = (process.env.EXTRA_ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const ALLOWED_ORIGINS = new Set([
  ...DEFAULT_ALLOWED_ORIGINS,
  ...extraAllowedOrigins,
]);

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  // Разрешаем нужные методы и заголовки
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Accept"
  );

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
// Test cases storage
// ------------------------------
const ensureTestCasesFile = () => {
  if (fs.existsSync(TEST_CASES_PATH)) {
    return;
  }
  fs.mkdirSync(path.dirname(TEST_CASES_PATH), { recursive: true });
  if (fs.existsSync(FALLBACK_TEST_CASES_PATH)) {
    fs.copyFileSync(FALLBACK_TEST_CASES_PATH, TEST_CASES_PATH);
    return;
  }
  fs.writeFileSync(TEST_CASES_PATH, "[]");
};

const readTestCases = () => {
  try {
    ensureTestCasesFile();
    const raw = fs.readFileSync(TEST_CASES_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[testcases] failed to read cases:", error);
    return [];
  }
};

const writeTestCases = (testCases) => {
  ensureTestCasesFile();
  fs.writeFileSync(TEST_CASES_PATH, JSON.stringify(testCases, null, 2));
};

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
  "unknowns",
  "solution_space",
  "decision",
  "experiment_plan",
  "work_package",
];

const keyInstructions = {
  framing: [
    "Card: Framing",
    "Purpose:",
    "- Reframe the task into a clear problem statement and constraints without proposing solutions or directions.",
    "- If funnel metrics are provided, diagnose where the biggest drop-offs are before any direction-setting.",
    "Input dependencies:",
    "- Task + Context + existing Case File (may update task_summary).",
    "Output format (strict):",
    "### Problem statement",
    "- <1-2 sentences describing the problem, no solution implied>",
    "",
    "### Desired outcome",
    "- <result needed, not how to achieve it>",
    "",
    "### Funnel diagnosis",
    "- If funnel/metrics exist in TASK/CONTEXT/CASE FILE, reference them verbatim.",
    "- If no funnel is given, define a minimal funnel as an assumption (Stage A/B/C) using plain names that fit the case.",
    "- Biggest drop-offs:",
    "  - <stage A → B>: <what happens>",
    "  - <stage B → C>: <what happens>",
    "- What this implies:",
    "  - <1–3 bullets explaining why this is likely happening>",
    "- Primary leverage point for the next 2 weeks:",
    "  - <choose 1 stage to prioritize and why>",
    "",
    "### Scope & non-goals",
    "- In scope:",
    "  - ...",
    "- Out of scope:",
    "  - ...",
    "",
    "### Constraints (only what is known)",
    "- Business:",
    "  - <if not specified: Not specified>",
    "- Product:",
    "  - <if not specified: Not specified>",
    "- Tech:",
    "  - <if not specified: Not specified>",
    "- Compliance / legal:",
    "  - <if not specified: Not specified>",
    "",
    "### Assumptions (required if info is missing)",
    "- Assumption (confidence: high/medium/low): ...",
    "  - Impact if wrong: ...",
    "  - How to validate quickly (no invented sample sizes/timelines): ...",
    "",
    "Quality rules:",
    "- No solutions, no recommended directions.",
    "- Do not invent constraints, stakeholders, or facts.",
    "- Funnel diagnosis must use provided numbers if present; otherwise keep it qualitative and explicitly assumed.",
    "- Assumptions must be 3–6, not more.",
    "- Max ~20 bullets total across sections.",
    "- No bullet should run longer than 3 lines.",
  ].join("\n"),

  unknowns: [
    "Card: Unknowns & Questions",
    "Purpose:",
    "- Surface blind spots and prioritize unknowns that block a decision.",
    "- Unknowns must be tied to a specific funnel stage when funnel data exists (or assumed funnel if none exists).",
    "Input dependencies:",
    "- Uses framing + constraints + assumptions from Case File.",
    "Output format (strict):",
    "### Blocking unknowns (top 3)",
    "- Unknown: ... (stage: <A → B>)",
    "  - Why it matters: ...",
    "  - Fastest way to validate (prefer no-user-contact first): ...",
    "",
    "### High-impact unknowns",
    "- Unknown: ... (stage: <A → B>)",
    "  - Why it matters: ...",
    "  - Fastest way to validate: ...",
    "",
    "### Cheap-to-answer (data / logs / quick prototype)",
    "- Unknown: ... (stage: <A → B>)",
    "  - Fastest way to validate: ...",
    "",
    "### Expensive-to-answer (research heavy)",
    "- Unknown: ... (stage: <A → B>)",
    "  - Fastest way to validate: ...",
    "",
    "### Red flags (if any)",
    "- Red flag: ...",
    "  - Why it matters: ...",
    "  - How to detect early: ...",
    "",
    "Quality rules:",
    "- Keep list concise; avoid long question lists.",
    "- Every unknown must include a fastest validation method.",
    "- Prefer validation via existing artifacts (analytics/logs/support/ops docs) before interviews when possible.",
    "- Do not propose numeric sample sizes (avoid '5–10 users').",
    "- Do not address the reader directly and do not ask questions.",
    "- Max 10 unknowns total across sections.",
    "- No bullet should run longer than 3 lines.",
  ].join("\n"),

  solution_space: [
    "Card: Solution space",
    "Purpose:",
    "- Provide distinct strategic directions (not UI variants) that could address the primary leverage point.",
    "- Treat any suggested solution in the task as a hypothesis and include credible alternatives.",
    "Input dependencies:",
    "- Uses framing + unknowns from Case File.",
    "Output format (strict):",
    "### Directions (exactly 4)",
    "#### A) <name>",
    "- What it is: <1 line>",
    "- Funnel stage targeted:",
    "  - <e.g., stage A → B>",
    "- Unknowns/assumptions it addresses:",
    "  - <cite at least 1 from the Case File>",
    "- Why it might work:",
    "  - ...",
    "- Trade-offs:",
    "  - ...",
    "- What to test first (fast, realistic, no invented numbers):",
    "  - ...",
    "",
    "#### B) <name>",
    "- What it is: <1 line>",
    "- Funnel stage targeted:",
    "  - ...",
    "- Unknowns/assumptions it addresses:",
    "  - ...",
    "- Why it might work:",
    "  - ...",
    "- Trade-offs:",
    "  - ...",
    "- What to test first (fast, realistic, no invented numbers):",
    "  - ...",
    "",
    "#### C) <name>",
    "- What it is: <1 line>",
    "- Funnel stage targeted:",
    "  - ...",
    "- Unknowns/assumptions it addresses:",
    "  - ...",
    "- Why it might work:",
    "  - ...",
    "- Trade-offs:",
    "  - ...",
    "- What to test first (fast, realistic, no invented numbers):",
    "  - ...",
    "",
    "#### D) <name>",
    "- What it is: <1 line>",
    "- Funnel stage targeted:",
    "  - ...",
    "- Unknowns/assumptions it addresses:",
    "  - ...",
    "- Why it might work:",
    "  - ...",
    "- Trade-offs:",
    "  - ...",
    "- What to test first (fast, realistic, no invented numbers):",
    "  - ...",
    "",
    "Quality rules:",
    "- Directions must be materially different (strategy/process/tooling/ops), not cosmetic variants.",
    "- Include at least one direction that challenges the task’s suggested solution.",
    "- Each direction must tie to at least one unknown/assumption from the Case File.",
    "- Do not propose anything that violates stated constraints; if unsure, mark as Assumption with low confidence.",
    "- No bullet should run longer than 3 lines.",
  ].join("\n"),

  decision: [
    "Card: Decision",
    "Purpose:",
    "- Recommend one direction based on fastest learning that de-risks the biggest unknowns, not taste.",
    "- Do NOT default to the proposed solution from the task; treat it as a hypothesis.",
    "Input dependencies:",
    "- Uses solution_space + unknowns + framing from Case File.",
    "Output format (strict):",
    "### Recommended direction",
    "- Pick: <A/B/C/D>",
    "",
    "### Rationale (tie to funnel + unknowns + learnability)",
    "- <2–5 bullets explaining why this direction best targets the leverage point and reduces key unknowns>",
    "",
    "### Why not the other directions yet",
    "- <1–3 bullets: what is currently unproven/too risky/too slow for each non-chosen option>",
    "",
    "### Backup direction",
    "- Pick: <A/B/C/D> (must differ from recommended)",
    "- Why this is the best fallback:",
    "  - ...",
    "",
    "### First checks (fast)",
    "- <2–4 checks that reduce the biggest unknowns (no invented timelines)>",
    "",
    "Quality rules:",
    "- The pick must exist in solution_space.",
    "- One primary + one backup only.",
    "- Avoid template filler (do not output standalone scoring like 'Validation speed: Medium').",
    "- First checks must reduce unknowns; do not propose 'ship and see'.",
    "- If task text contains a proposed solution, state what would need to be true to choose it (or why it is deferred).",
    "- Max ~12 bullets total across sections.",
    "- No bullet should run longer than 3 lines.",
  ].join("\n"),

  experiment_plan: [
    "Card: Experiment plan",
    "Purpose:",
    "- Translate the decision into validation + measurement without invented numbers.",
    "- Choose tests that fit the scenario (do not default to landing pages unless a digital acquisition surface is clearly implied).",
    "Input dependencies:",
    "- Uses decision + unknowns + framing from Case File.",
    "Output format (strict):",
    "### Fastest validation (smoke / dry run / paper test)",
    "- Goal:",
    "- Setup:",
    "- What we measure:",
    "- Pass/fail signal (qualitative unless user provided targets):",
    "  - <e.g., 'meaningful lift vs baseline' OR reference provided targets only>",
    "",
    "### Prototype usability test",
    "- Goal:",
    "- Participants:",
    "- Script (3–5 steps):",
    "- What we measure:",
    "",
    "### A/B test (only if applicable)",
    "- Hypothesis:",
    "- Variants:",
    "- Primary metric:",
    "- Guardrails:",
    "- Duration: Not specified",
    "",
    "### Metrics definitions (use provided targets if given)",
    "- Leading:",
    "  - <metric> - How to measure:",
    "- Outcome:",
    "  - <metric> - How to measure:",
    "- Guardrails:",
    "  - <metric> - How to measure:",
    "",
    "### Instrumentation / tracking needed",
    "- Event: <name>",
    "  - When fired:",
    "  - Properties:",
    "",
    "Quality rules:",
    "- Do not invent targets, thresholds, sample sizes, or timelines.",
    "- If user provided targets (e.g., +20%), you may reference them verbatim.",
    "- Each test must tie back to the biggest unknowns AND the primary leverage point.",
    "- If A/B is not applicable, state 'Not applicable' and provide the closest credible alternative comparison.",
    "- Keep instrumentation concrete and minimal; no invented business KPIs.",
    "- Max ~14 bullets total across sections.",
    "- No bullet should run longer than 3 lines.",
  ].join("\n"),

  work_package: [
    "Card: Work package",
    "Purpose:",
    "- Provide concrete design/development artifacts tied to the chosen direction and experiment plan.",
    "Input dependencies:",
    "- Uses decision + experiment_plan from Case File.",
    "Output format (strict):",
    "### User flow (high level)",
    "- Step 1:",
    "- Step 2:",
    "",
    "### Acceptance criteria (must be testable, no invented numeric targets)",
    "- ...",
    "",
    "### Edge cases",
    "- ...",
    "",
    "### Copy notes / UX notes",
    "- ...",
    "",
    "### Analytics events to track",
    "- Event:",
    "  - When fired:",
    "  - Properties:",
    "",
    "### Prototype outline (for Figma)",
    "- Screens:",
    "  - ...",
    "- States:",
    "  - ...",
    "- Components:",
    "  - ...",
    "",
    "Quality rules:",
    "- Everything must align to the recommended direction and planned tests.",
    "- Acceptance criteria must be binary/testable (avoid invented % goals, time limits, or recall targets).",
    "- Prototype outline must stay focused on what is needed to run the experiment.",
    "Assumptions policy:",
    "- If you introduce new entities, mark them as assumptions.",
    "- Max 12 bullets total across sections.",
    "- No bullet should run longer than 3 lines.",
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
  return [
    "You are a senior product designer + product owner-level product thinker.",
    `Respond only for the "${key}" card.`,
    `Write in ${languageLabel}.`,
    "You must follow the Output format exactly.",
    "Respond with plain text only. Use markdown headings '###'. No JSON.",
    "",
    "Core rules (strict):",
    "- No-direct-user rule: do not address the reader directly (avoid 'you') and do not ask questions.",
    "- Unknowns must be written as statements starting with 'Unknown:'.",
    "- Assumptions must start with 'Assumption:' and include confidence when the format asks for it.",
    "- Source of truth: use only TASK + CONTEXT + CASE FILE. Do not invent missing facts.",
    "- Avoid fluff. Every bullet must be checkable and copy-pastable into a ticket.",
    "- Keep sections short with scannable bullets. Avoid deep nesting and long multi-line bullets.",
    "",
    "Numbers rule (strict):",
    "- You may ONLY use numeric thresholds/targets if the user provided them in TASK/CONTEXT/CASE FILE.",
    "- Never invent pass/fail thresholds, % deltas, sample sizes, or timelines.",
    "- Avoid numeric ranges entirely (examples to avoid: '24–72h', '5–10 users', '90%', '30 minutes', '+15%').",
    "- If a pass/fail signal is required, define it qualitatively (e.g., 'meaningful lift vs baseline').",
    "",
    "Funnel-first rule:",
    "- If the task includes funnel/metrics, you MUST use them explicitly and name the biggest drop-offs (stage A → B).",
    "- If no funnel is provided, define a minimal funnel (Stage A/B/C) as an assumption and keep it consistent.",
    "- Do NOT tunnel on a proposed solution. Treat it as a hypothesis unless proven.",
    "",
    "Anti-tunnel rule:",
    "- If the task text suggests a solution, you MUST present credible alternative directions before selecting.",
    "- Recommended direction must be justified by funnel diagnosis + fastest learning + unknown reduction.",
    "",
    "Experiment realism rule:",
    "- Do not default to landing pages/fake doors unless a digital acquisition surface is clearly implied in the case.",
    "",
    "Consistency rule:",
    "- Use the Case File as the single source of truth across subsequent cards.",
    "- Stay consistent with earlier cards; update only if the key explicitly allows it.",
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
      if (!value) return null;
      if (typeof value === "string") {
        return `${key}: ${value}`;
      }
      if (typeof value === "object") {
        if (typeof value.value === "string") {
          return `${key}: ${value.value}`;
        }
        if (typeof value.full === "string") {
          return `${key}: ${value.full}`;
        }
      }
      return null;
    })
    .filter(Boolean);

  return lines.length ? lines.join("\n") : "(none)";
}

function appendDebugLine(value, caseFile) {
  if (process.env.DEBUG_CASEFILE !== "true") {
    return value;
  }
  const safeCaseFile = caseFile || createEmptyCaseFile();
  const assumptionsCount = Array.isArray(safeCaseFile?.assumptions)
    ? safeCaseFile.assumptions.length
    : 0;
  const blockingUnknownsCount = Array.isArray(
    safeCaseFile?.unknowns?.blocking
  )
    ? safeCaseFile.unknowns.blocking.length
    : 0;
  const directionsCount = Array.isArray(safeCaseFile?.solution_space?.directions)
    ? safeCaseFile.solution_space.directions.length
    : 0;
  const recommendedDirection =
    safeCaseFile?.decision?.recommended_direction_id || "";
  return `${value}\n[debug] assumptions=${assumptionsCount} | blocking_unknowns=${blockingUnknownsCount} | directions=${directionsCount} | recommended="${recommendedDirection}"`;
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
                content:
                  "Respond with plain text only. Use markdown headings '###'. No JSON. Do not ask questions. Do not invent numbers.",
              },
              { role: "user", content: prompt },
            ],
            temperature: KEY_COMPLETION_TEMPERATURE,
            max_tokens: KEY_COMPLETION_MAX_TOKENS,
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

function buildSummaryPrompt({ key, language, fullValue, strictAntiCopy = false }) {
  const languageLabel = languageLabels[language] || "English";
  return [
    "You are a senior product designer + product owner-level product thinker.",
    `Summarize the "${key}" card into a dense, decision-grade digest.`,
    `Write in ${languageLabel}.`,
    "Summary rules (strict):",
    "- Plain text only. No markdown symbols (#, **, *, _, >). No JSON. No tables.",
    "- Produce a digest, not a reformat of the full output.",
    "- 12–25 lines total. Use 3–6 semantic blocks.",
    "- Each block starts with a short, unique label (1–4 words) ending with ':' on its own line.",
    "- Labels must be diverse and chosen based on content. Do not reuse the same label.",
    "- Inside a block use short sentences or compact bullets; avoid long multi-line items.",
    "- Do not mirror the structure of the full output or reuse its headings.",
    "- Include: what matters, why it matters, and what to do next.",
    "- Use concrete details from the full output (funnel stages, specific unknowns, decision, tests).",
    "- No new metrics, directions, tests, stakeholders, goals, sample sizes, or timelines.",
    "- No filler like 'analyze data'—replace with specific actions already in the full output.",
    "- Never invent numbers. If numbers appear, copy them verbatim from the full output.",
    "- No standalone questions; unknowns must be statements.",
    "- Do not repeat a block. Do not start over. Only one digest.",
    "- Do NOT contradict the full output or add new facts.",
    strictAntiCopy
      ? "- STRICT ANTI-COPY MODE: Do not reuse sentences, bullets, or structure from the full output. Paraphrase and compress."
      : "",
    "",
    "FULL OUTPUT TO SUMMARIZE:",
    fullValue,
    "",
    "Return only the summary. No extra text.",
  ].join("\n");
}

async function runSummary({ key, language, fullValue, signal, strictAntiCopy }) {
  const prompt = buildSummaryPrompt({ key, language, fullValue, strictAntiCopy });
  const result = await runWithTimeout(
    `OpenAI summary ${key} request`,
    OPENAI_TIMEOUT_MS,
    (signal) =>
      openaiClient.chat.completions.create(
        {
          model: OPENAI_MODEL,
          messages: [
            {
              role: "system",
              content: "Return only the summary in plain text. Do not invent numbers or new facts.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 520,
        },
        { signal }
      ),
    { signal }
  );
  if (!result.ok) {
    throw result.error;
  }

  const content = result.value?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("OpenAI summary response was empty");
  }
  return content.trim();
}

function isSummaryTooSimilar(summary, fullValue) {
  if (!summary || !fullValue) return false;
  if (summary.includes("###") || summary.includes("####")) return true;
  const summaryLines = summary
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const fullLines = new Set(
    fullValue
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
  );
  if (summaryLines.length === 0) return false;
  const matched = summaryLines.filter((line) => fullLines.has(line)).length;
  return matched / summaryLines.length > 0.4;
}

async function generateSummaryWithRetry({ key, language, fullValue, signal }) {
  let summary = await runSummary({ key, language, fullValue, signal });
  if (!isSummaryTooSimilar(summary, fullValue)) {
    return summary;
  }
  try {
    const retrySummary = await runSummary({
      key,
      language,
      fullValue,
      signal,
      strictAntiCopy: true,
    });
    if (retrySummary) {
      summary = retrySummary;
    }
  } catch (error) {
    console.warn(`[summary] retry failed for key=${key}:`, error);
  }
  return summary;
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
    "You are a senior product designer + product owner-level product thinker.",
    `Write a deeper, more detailed version of the "${key}" card.`,
    `Write in ${languageLabels[language] || "English"}.`,
    "Follow the Output format exactly.",
    "Respond with plain text only. Use markdown headings '###'. No JSON.",
    "No-direct-user rule: do not address the reader directly (avoid 'you') and do not ask questions.",
    "Unknowns must start with 'Unknown:' and assumptions with 'Assumption:'.",
    "Numbers rule (strict): do not invent targets, thresholds, sample sizes, or timelines.",
    "Avoid fluff. Every bullet must be checkable or directly useful for execution.",
    "Keep sections short with scannable bullets (no bullet longer than 3 lines). Avoid deep nesting.",
    "Every output must include at least one explicit assumption.",
    "Do not introduce new stakeholders/entities unless necessary; if you do, mark as Assumption.",
    "Stay consistent with the current analysis for the other keys.",
    "Use the Case File as the source of truth.",
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
                content:
                  "Respond with plain text only. Use markdown headings '###'. No JSON. Do not ask questions. Do not invent numbers.",
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
    "You are a senior product designer + product owner-level product thinker.",
    `Rewrite the "${key}" card to be more realistic and grounded.`,
    `Write in ${languageLabels[language] || "English"}.`,
    "Re-check realism, remove abstractions, and keep everything tied to the Case File.",
    "Follow the Output format exactly.",
    "Respond with plain text only. Use markdown headings '###'. No JSON.",
    "No-direct-user rule: do not address the reader directly (avoid 'you') and do not ask questions.",
    "Unknowns must start with 'Unknown:' and assumptions with 'Assumption:'.",
    "Numbers rule (strict): remove invented targets, thresholds, sample sizes, and timelines. Keep only user-provided numbers.",
    "Avoid fluff. Every bullet must be checkable or directly useful for execution.",
    "Keep sections short with scannable bullets (no bullet longer than 3 lines). Avoid deep nesting.",
    "Every output must include at least one explicit assumption.",
    "Do not introduce new stakeholders/entities unless necessary; if you do, mark as Assumption.",
    "Stay consistent with the other keys.",
    "Use the Case File as the source of truth.",
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
                content:
                  "Respond with plain text only. Use markdown headings '###'. No JSON. Do not ask questions. Do not invent numbers.",
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

    const language = resolveLanguage(task);
    const analysis = {};
    let caseFile = createEmptyCaseFile();

    for (const key of analysisKeys) {
      const full = await runKeyCompletion({
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
          full,
          caseFile,
          task,
          context
        );
      } catch (updateError) {
        console.warn(`[casefile] update failed after ${key}:`, updateError);
      }
      caseFile = updatedCaseFile;
      let summary = "";
      try {
        summary = await generateSummaryWithRetry({
          key,
          language,
          fullValue: full,
        });
      } catch (summaryError) {
        console.warn(`[summary] failed for key=${key}:`, summaryError);
      }
      analysis[key] = {
        summary,
        value: appendDebugLine(full, caseFile),
      };
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

app.get("/testcases", (req, res) => {
  const testCases = readTestCases();
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.send(JSON.stringify(testCases, null, 2));
});

app.post("/testcases", (req, res) => {
  const testCases = req.body;
  if (!Array.isArray(testCases)) {
    return res.status(400).json({ error: "test cases must be an array" });
  }
  writeTestCases(testCases);
  return res.json({
    status: "ok",
    contexts: testCases.length,
  });
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

  const language = resolveLanguage(task);
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

        let summary = "";
        try {
          summary = await generateSummaryWithRetry({
            key,
            language,
            fullValue: value,
          });
        } catch (summaryError) {
          console.warn(`[summary] failed for key=${key}:`, summaryError);
        }
        const valueWithDebug = appendDebugLine(value, caseFile);
        writeSseEvent(res, "key", {
          key,
          summary,
          value: valueWithDebug,
          status: "ok",
        });
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

    const language = resolveLanguage(task);
    const value = await runDeeper({
      key,
      task,
      context,
      language,
      currentAnalysis,
      caseFile,
    });
    let summary = "";
    try {
      summary = await generateSummaryWithRetry({
        key,
        language,
        fullValue: value,
      });
    } catch (summaryError) {
      console.warn(`[summary] failed for key=${key}:`, summaryError);
    }

    return res.json({
      key,
      summary,
      value: appendDebugLine(value, caseFile),
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

    const language = resolveLanguage(task);
    const updatedValue = await runVerify({
      key,
      task,
      context,
      language,
      currentAnalysis,
      value,
      caseFile,
    });
    let summary = "";
    try {
      summary = await generateSummaryWithRetry({
        key,
        language,
        fullValue: updatedValue,
      });
    } catch (summaryError) {
      console.warn(`[summary] failed for key=${key}:`, summaryError);
    }

    return res.json({
      key,
      summary,
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
