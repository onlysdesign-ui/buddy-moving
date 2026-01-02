const DEFAULT_CASE_FILE = {
  task_summary: {
    problem: "",
    outcome: "",
    non_goals: [],
    constraints: {
      business: [],
      product: [],
      tech: [],
      compliance: [],
    },
  },
  assumptions: [],
  unknowns: {
    blocking: [],
    high_impact: [],
    cheap_to_answer: [],
    expensive_to_answer: [],
    red_flags: [],
  },
  solution_space: {
    directions: [],
  },
  decision: {
    criteria: [],
    recommended_direction_id: "",
    backup_direction_id: "",
    reasoning: [],
    first_checks: [],
  },
  experiment_plan: {
    fastest_test: [],
    prototype_test: [],
    ab_test: [],
    metrics: [],
    instrumentation: [],
    stop_criteria: [],
  },
  work_package: {
    user_flow: [],
    acceptance_criteria: [],
    edge_cases: [],
    copy_notes: [],
    analytics_events: [],
    prototype_outline: {
      screens: [],
      states: [],
      components: [],
    },
  },
  backlog: {
    research_tasks: [],
    design_tasks: [],
    analytics_tasks: [],
    dev_tasks: [],
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

function normalizeKey(value) {
  return normalizeString(value).toLowerCase();
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
  const seen = new Set(result.map((item) => normalizeKey(item)).filter(Boolean));
  for (const item of incomingArray) {
    const normalized = normalizeString(item);
    const normalizedKey = normalizeKey(item);
    if (!normalized || seen.has(normalizedKey)) continue;
    seen.add(normalizedKey);
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
    const keyValue = normalizeKey(result[i]?.[keyField]);
    if (keyValue) indexByKey.set(keyValue, i);
  }

  for (const item of incomingArray) {
    if (!item || typeof item !== "object") continue;
    const keyValue = normalizeKey(item[keyField]);
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
    nextCaseFile.assumptions = mergeStringArray(
      base.assumptions,
      patch.assumptions
    );
  }

  if (patch.unknowns) {
    nextCaseFile.unknowns = mergeObjectFields(base.unknowns, patch.unknowns);
  }

  if (patch.solution_space?.directions) {
    nextCaseFile.solution_space = {
      ...base.solution_space,
      directions: mergeArrayByKey(
        base.solution_space?.directions,
        patch.solution_space.directions,
        "id",
        {
          why: "string",
          must_be_true: "string",
          trade_offs: "string",
          what_to_test_first: "string",
        }
      ),
    };
  }

  if (patch.decision) {
    nextCaseFile.decision = mergeObjectFields(base.decision, patch.decision, {
      mergeKeys: {
        criteria: "string",
        reasoning: "string",
        first_checks: "string",
      },
    });
  }

  if (patch.experiment_plan) {
    const basePlan = base.experiment_plan || {};
    const incoming = patch.experiment_plan || {};
    nextCaseFile.experiment_plan = mergeObjectFields(basePlan, incoming, {
      mergeKeys: {
        fastest_test: "string",
        prototype_test: "string",
        ab_test: "string",
        instrumentation: "string",
        stop_criteria: "string",
      },
    });
    if (Array.isArray(incoming.metrics)) {
      nextCaseFile.experiment_plan.metrics = mergeArrayByKey(
        basePlan.metrics,
        incoming.metrics,
        "name",
        { notes: "string" }
      );
    }
  }

  if (patch.work_package) {
    const basePackage = base.work_package || {};
    const incoming = patch.work_package || {};
    nextCaseFile.work_package = mergeObjectFields(basePackage, incoming, {
      mergeKeys: {
        user_flow: "string",
        acceptance_criteria: "string",
        edge_cases: "string",
        copy_notes: "string",
      },
    });
    if (Array.isArray(incoming.analytics_events)) {
      nextCaseFile.work_package.analytics_events = mergeArrayByKey(
        basePackage.analytics_events,
        incoming.analytics_events,
        "event",
        { properties: "string" }
      );
    }
  }

  if (patch.backlog) {
    const baseBacklog = base.backlog || {};
    const incoming = patch.backlog || {};
    nextCaseFile.backlog = {
      research_tasks: mergeArrayByKey(
        baseBacklog.research_tasks,
        incoming.research_tasks,
        "title",
        { definition_of_done: "string" }
      ),
      design_tasks: mergeArrayByKey(
        baseBacklog.design_tasks,
        incoming.design_tasks,
        "title",
        { definition_of_done: "string" }
      ),
      analytics_tasks: mergeArrayByKey(
        baseBacklog.analytics_tasks,
        incoming.analytics_tasks,
        "title",
        { definition_of_done: "string" }
      ),
      dev_tasks: mergeArrayByKey(
        baseBacklog.dev_tasks,
        incoming.dev_tasks,
        "title",
        { definition_of_done: "string" }
      ),
    };
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
    "- Dedupe strings case-insensitively.",
    "- Dedupe directions by id; metrics by name; tasks by title.",
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
