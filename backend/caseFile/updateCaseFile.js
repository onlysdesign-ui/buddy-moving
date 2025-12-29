const DEFAULT_CASE_FILE = {
  task_summary: {
    problem: "",
    outcome: "",
    non_goals: [],
  },
  assumptions: [],
  primary_focus: {
    segment: "",
    reasoning: [],
    confidence: "",
  },
  segments: {
    primary: {
      who: "",
      goals: [],
      pains: [],
      triggers: [],
    },
    secondary: [],
  },
  hypotheses: [],
  scenarios: [],
  success_criteria: [],
  solution_options: {
    option_a: {
      name: "",
      description: "",
      why: [],
      tradeoffs: [],
      risks: [],
    },
    option_b: null,
    option_c: null,
  },
  recommendation: {
    chosen_option: "",
    why: [],
    tradeoffs: [],
    first_week_plan: [],
    first_validation_steps: [],
    if_assumptions_wrong: [],
  },
};

let openaiClient = null;
let openaiModel = "gpt-4o-mini";
let timeoutMs = 30000;
let runWithTimeout = null;

function configureCaseFileUpdater({ client, model, timeout, timeoutMs: nextTimeoutMs, runWithTimeout: nextRunWithTimeout }) {
  if (client) openaiClient = client;
  if (model) openaiModel = model;
  if (typeof timeout === "number") timeoutMs = timeout;
  if (typeof nextTimeoutMs === "number") timeoutMs = nextTimeoutMs;
  if (nextRunWithTimeout) runWithTimeout = nextRunWithTimeout;
}

function createEmptyCaseFile() {
  return JSON.parse(JSON.stringify(DEFAULT_CASE_FILE));
}

function normalizeString(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function isNonEmptyString(value) {
  return normalizeString(value).length > 0;
}

function mergeString(targetValue, incomingValue) {
  if (!isNonEmptyString(incomingValue)) return targetValue;
  return normalizeString(incomingValue);
}

function mergeStringArray(targetArray, incomingArray) {
  if (!Array.isArray(incomingArray) || incomingArray.length === 0) {
    return targetArray;
  }
  const result = Array.isArray(targetArray) ? [...targetArray] : [];
  const seen = new Set(result.map((item) => normalizeString(item)).filter(Boolean));
  for (const item of incomingArray) {
    const normalized = normalizeString(item);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function mergeObjectFields(target, incoming, options = {}) {
  if (!incoming || typeof incoming !== "object") return target;
  const output = { ...(target || {}) };
  const mergeKeys = options.mergeKeys || {};

  for (const [key, value] of Object.entries(incoming)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string") {
      if (isNonEmptyString(value)) {
        output[key] = normalizeString(value);
      }
      continue;
    }
    if (Array.isArray(value)) {
      const mergeMode = mergeKeys[key] || "string";
      if (mergeMode === "string") {
        output[key] = mergeStringArray(output[key], value);
      }
      continue;
    }
    if (typeof value === "object") {
      output[key] = mergeObjectFields(output[key], value, { mergeKeys });
    }
  }

  return output;
}

function mergeArrayByKey(targetArray, incomingArray, keyField, mergeKeys = {}) {
  if (!Array.isArray(incomingArray) || incomingArray.length === 0) {
    return targetArray || [];
  }
  const result = Array.isArray(targetArray) ? [...targetArray] : [];
  const indexByKey = new Map();
  for (let i = 0; i < result.length; i += 1) {
    const keyValue = normalizeString(result[i]?.[keyField]);
    if (keyValue) indexByKey.set(keyValue, i);
  }

  for (const item of incomingArray) {
    if (!item || typeof item !== "object") continue;
    const keyValue = normalizeString(item[keyField]);
    if (!keyValue) continue;

    if (indexByKey.has(keyValue)) {
      const index = indexByKey.get(keyValue);
      result[index] = mergeObjectFields(result[index], item, { mergeKeys });
    } else {
      const mergedItem = mergeObjectFields({}, item, { mergeKeys });
      result.push(mergedItem);
      indexByKey.set(keyValue, result.length - 1);
    }
  }

  return result;
}

function mergeSolutionOption(target, incoming) {
  if (!incoming || typeof incoming !== "object") return target;
  return mergeObjectFields(target, incoming, {
    mergeKeys: {
      why: "string",
      tradeoffs: "string",
      risks: "string",
    },
  });
}

function mergeSolutionOptions(target, incoming) {
  if (!incoming || typeof incoming !== "object") return target;
  const output = { ...(target || {}) };

  if (incoming.option_a && typeof incoming.option_a === "object") {
    output.option_a = mergeSolutionOption(output.option_a, incoming.option_a);
  }

  if (incoming.option_b && typeof incoming.option_b === "object") {
    if (!output.option_b) output.option_b = {};
    output.option_b = mergeSolutionOption(output.option_b, incoming.option_b);
  }

  if (incoming.option_c && typeof incoming.option_c === "object") {
    if (!output.option_c) output.option_c = {};
    output.option_c = mergeSolutionOption(output.option_c, incoming.option_c);
  }

  return output;
}

function mergeCaseFile(currentCaseFile, patch) {
  const base = currentCaseFile || createEmptyCaseFile();
  if (!patch || typeof patch !== "object") return base;

  const nextCaseFile = { ...base };

  if (patch.task_summary) {
    nextCaseFile.task_summary = mergeObjectFields(
      base.task_summary,
      patch.task_summary,
      { mergeKeys: { non_goals: "string" } }
    );
  }

  if (Array.isArray(patch.assumptions)) {
    nextCaseFile.assumptions = mergeArrayByKey(
      base.assumptions,
      patch.assumptions,
      "text"
    );
  }

  if (patch.primary_focus) {
    nextCaseFile.primary_focus = mergeObjectFields(
      base.primary_focus,
      patch.primary_focus,
      { mergeKeys: { reasoning: "string" } }
    );
  }

  if (patch.segments) {
    const baseSegments = base.segments || {};
    const incoming = patch.segments || {};
    nextCaseFile.segments = {
      primary: mergeObjectFields(baseSegments.primary, incoming.primary, {
        mergeKeys: { goals: "string", pains: "string", triggers: "string" },
      }),
      secondary: mergeArrayByKey(
        baseSegments.secondary,
        incoming.secondary,
        "who",
        { goals: "string", pains: "string" }
      ),
    };
  }

  if (Array.isArray(patch.hypotheses)) {
    nextCaseFile.hypotheses = mergeArrayByKey(
      base.hypotheses,
      patch.hypotheses,
      "statement",
      { depends_on: "string" }
    );
  }

  if (Array.isArray(patch.scenarios)) {
    nextCaseFile.scenarios = mergeArrayByKey(
      base.scenarios,
      patch.scenarios,
      "name",
      { steps: "string", success_criteria: "string" }
    );
  }

  if (Array.isArray(patch.success_criteria)) {
    nextCaseFile.success_criteria = mergeArrayByKey(
      base.success_criteria,
      patch.success_criteria,
      "criterion"
    );
  }

  if (patch.solution_options) {
    nextCaseFile.solution_options = mergeSolutionOptions(
      base.solution_options,
      patch.solution_options
    );
  }

  if (patch.recommendation) {
    nextCaseFile.recommendation = mergeObjectFields(
      base.recommendation,
      patch.recommendation,
      {
        mergeKeys: {
          why: "string",
          tradeoffs: "string",
          first_week_plan: "string",
          first_validation_steps: "string",
          if_assumptions_wrong: "string",
        },
      }
    );
  }

  return nextCaseFile;
}

async function updateCaseFile(cardType, cardText, caseFile, task, context) {
  if (!openaiClient) {
    throw new Error("OpenAI client is not configured for updateCaseFile");
  }
  const prompt = [
    "You update a structured JSON caseFile in a product analysis pipeline.",
    "Given cardType, cardText, task, context, and the current caseFile,",
    "return a JSON object with ONLY the fields that should be merged into caseFile.",
    "Rules:",
    "- Output valid JSON only. No markdown.",
    "- Do NOT restate the entire caseFile.",
    "- Omit empty fields; do not include nulls or empty arrays.",
    "- Avoid duplicates; reuse existing entities where possible.",
    "- Assumptions unique by text; hypotheses unique by statement; scenarios unique by name; success_criteria unique by criterion.",
    "- Keep output short (<= 500 tokens).",
    "",
    "caseFile schema:",
    JSON.stringify(createEmptyCaseFile()),
    "",
    `cardType: ${cardType}`,
    "cardText:",
    cardText,
    "",
    "task:",
    task,
    "",
    "context:",
    context || "(none)",
    "",
    "current caseFile JSON:",
    JSON.stringify(caseFile || createEmptyCaseFile()),
  ].join("\n");

  const executeRequest = (signal) =>
    openaiClient.chat.completions.create(
      {
        model: openaiModel,
        messages: [
          {
            role: "system",
            content:
              "You return JSON patch objects for caseFile updates. Output JSON only.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 450,
        response_format: { type: "json_object" },
      },
      { signal }
    );

  let response;
  if (runWithTimeout) {
    const result = await runWithTimeout(
      "OpenAI caseFile update",
      timeoutMs,
      executeRequest
    );
    if (!result.ok) {
      throw result.error;
    }
    response = result.value;
  } else {
    response = await executeRequest();
  }

  const content = response?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("OpenAI caseFile response was empty");
  }

  let patch;
  try {
    patch = JSON.parse(content);
  } catch (error) {
    const parseError = new Error("OpenAI caseFile response was not valid JSON");
    parseError.cause = error;
    throw parseError;
  }

  return mergeCaseFile(caseFile, patch);
}

module.exports = {
  configureCaseFileUpdater,
  createEmptyCaseFile,
  mergeCaseFile,
  updateCaseFile,
};
