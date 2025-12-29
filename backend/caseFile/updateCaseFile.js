const DEFAULT_CASE_FILE = {
  task_summary: {
    short: "",
    key_goal: "",
    scope: "",
    assumptions: [],
  },
  constraints: {
    product_constraints: [],
    technical_constraints: [],
    time_constraints: [],
    legal_or_policy_constraints: [],
  },
  audience_model: {
    primary_users: [],
    secondary_users: [],
    jobs_to_be_done: [],
  },
  key_scenarios: [],
  success_metrics: [],
  risks: [],
  open_questions: [],
  recommended_approach: {
    option_a: {
      name: "",
      description: "",
      why: [],
      tradeoffs: [],
    },
    option_b: null,
    first_validation_steps: [],
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

function mergeRecommendedApproach(target, incoming) {
  if (!incoming || typeof incoming !== "object") return target;
  const output = { ...(target || {}) };

  if (incoming.option_a && typeof incoming.option_a === "object") {
    output.option_a = mergeObjectFields(output.option_a, incoming.option_a, {
      mergeKeys: {
        why: "string",
        tradeoffs: "string",
      },
    });
  }

  if (incoming.option_b && typeof incoming.option_b === "object") {
    if (!output.option_b) output.option_b = {};
    output.option_b = mergeObjectFields(output.option_b, incoming.option_b, {
      mergeKeys: {
        why: "string",
        tradeoffs: "string",
      },
    });
  }

  if (Array.isArray(incoming.first_validation_steps)) {
    output.first_validation_steps = mergeStringArray(
      output.first_validation_steps,
      incoming.first_validation_steps
    );
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
      { mergeKeys: { assumptions: "string" } }
    );
  }

  if (patch.constraints) {
    nextCaseFile.constraints = mergeObjectFields(
      base.constraints,
      patch.constraints,
      {
        mergeKeys: {
          product_constraints: "string",
          technical_constraints: "string",
          time_constraints: "string",
          legal_or_policy_constraints: "string",
        },
      }
    );
  }

  if (patch.audience_model) {
    const audience = base.audience_model || {};
    const incoming = patch.audience_model || {};
    nextCaseFile.audience_model = {
      ...audience,
      jobs_to_be_done: mergeStringArray(audience.jobs_to_be_done, incoming.jobs_to_be_done),
      primary_users: mergeArrayByKey(
        audience.primary_users,
        incoming.primary_users,
        "who",
        { goals: "string", pains: "string" }
      ),
      secondary_users: mergeArrayByKey(
        audience.secondary_users,
        incoming.secondary_users,
        "who",
        { goals: "string", pains: "string" }
      ),
    };
  }

  if (patch.key_scenarios) {
    nextCaseFile.key_scenarios = mergeArrayByKey(
      base.key_scenarios,
      patch.key_scenarios,
      "name",
      { steps: "string", success_criteria: "string" }
    );
  }

  if (patch.success_metrics) {
    nextCaseFile.success_metrics = mergeArrayByKey(
      base.success_metrics,
      patch.success_metrics,
      "name"
    );
  }

  if (patch.risks) {
    nextCaseFile.risks = mergeArrayByKey(base.risks, patch.risks, "name");
  }

  if (patch.open_questions) {
    nextCaseFile.open_questions = mergeArrayByKey(
      base.open_questions,
      patch.open_questions,
      "question"
    );
  }

  if (patch.recommended_approach) {
    nextCaseFile.recommended_approach = mergeRecommendedApproach(
      base.recommended_approach,
      patch.recommended_approach
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
    "- Keep output short (<= 500 tokens).",
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
