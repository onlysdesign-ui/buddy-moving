const express = require("express");
const path = require("path");
const { execFile } = require("child_process");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, ".env") });

const AI_BASE_URL = process.env.AI_BASE_URL;
const AI_API_KEY = process.env.AI_API_KEY;
const AI_MODEL = process.env.AI_MODEL || "gpt-4o-mini";

const app = express();
const port = process.env.PORT || 3000;

console.log("AI_BASE_URL:", AI_BASE_URL ? "set" : "missing");
console.log("AI_API_KEY:", AI_API_KEY ? "set" : "missing");
console.log("AI_MODEL:", AI_MODEL);

app.use(express.json());
app.use(express.static(path.join(__dirname, "../docs")));

const mockAnalysis = {
  analysis: {
    audience: ["New users", "Returning users"],
    metrics: ["Activation rate", "Conversion rate", "Retention"],
    risks: ["Unclear success metric", "Edge cases not covered"],
    questions: ["What is the primary user goal?", "What is the success metric?"],
    scenarios: ["User opens app → sees onboarding → completes key action"],
    approaches: [
      "Simplify the flow and reduce steps",
      "Add contextual hints and progressive disclosure",
      "A/B test variants and track key metrics",
    ],
  },
};

function callGatewayWithCurl({ baseURL, apiKey, model, messages }) {
  const url = `${baseURL}/chat/completions`;
  const payload = JSON.stringify({ model, messages, temperature: 0.2 });

  const runOnce = () =>
    new Promise((resolve, reject) => {
      const args = [
        "-sS",
        "--max-time", "30",
        "-X", "POST", url,
        "-H", "Content-Type: application/json",
        "-H", `Authorization: Bearer ${apiKey}`,
        "-H", "Accept: application/json",
        "-H", "User-Agent: BuddyMoving/1.0",
        "--data", payload,
      ];

      execFile("curl", args, { maxBuffer: 1024 * 1024 * 5 }, (err, stdout, stderr) => {
        if (err) return reject(new Error(stderr || err.message));

        // Cloudflare challenge = HTML
        if (stdout.includes("<!DOCTYPE html") || stdout.includes("Just a moment") || stdout.includes("__cf_chl")) {
          return reject(new Error("Cloudflare challenge"));
        }

        try {
          resolve(JSON.parse(stdout));
        } catch (e) {
          reject(new Error("Failed to parse JSON: " + stdout.slice(0, 200)));
        }
      });
    });

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  return (async () => {
    let lastErr;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        if (attempt > 1) await sleep(700 * attempt);
        return await runOnce();
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr;
  })();
}


app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    ai: Boolean(AI_BASE_URL && AI_API_KEY),
    model: AI_MODEL || null,
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

    if (!AI_BASE_URL || !AI_API_KEY) {
      return res.status(500).json({ error: "AI is not configured (missing env vars)" });
    }

    const prompt = `
You are a product design copilot.
Return STRICT JSON with keys:
audience (array of strings),
metrics (array of strings),
risks (array of strings),
questions (array of strings),
scenarios (array of strings),
approaches (array of strings).

Rules:
- Output must be valid JSON only.
- No markdown, no backticks, no explanations.

Task: ${task}
Context: ${context || "(none)"}
`.trim();

    // --- CALL GATEWAY VIA CURL (avoids Cloudflare blocking Node fetch) ---
    const data = await callGatewayWithCurl({
      baseURL: AI_BASE_URL,
      apiKey: AI_API_KEY,
      model: AI_MODEL,
      messages: [{ role: "user", content: prompt }],
    });

    const content = data?.choices?.[0]?.message?.content || "";

    // Some models sometimes wrap JSON in ```json ...```
    const cleaned = content
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      // Return safe structure so frontend never breaks
      return res.json({
        analysis: {
          ...mockAnalysis.analysis,
          raw: content,
        },
      });
    }

    // Ensure required keys exist (defensive)
    const analysis = {
      audience: Array.isArray(parsed.audience) ? parsed.audience : [],
      metrics: Array.isArray(parsed.metrics) ? parsed.metrics : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks : [],
      questions: Array.isArray(parsed.questions) ? parsed.questions : [],
      scenarios: Array.isArray(parsed.scenarios) ? parsed.scenarios : [],
      approaches: Array.isArray(parsed.approaches) ? parsed.approaches : [],
    };

    return res.json({ analysis });
  } catch (err) {
    console.error("AI analyze error:", err?.message || err);
    // Don't break frontend
    return res.status(200).json({
      analysis: {
        ...mockAnalysis.analysis,
        error: String(err?.message || err),
      },
    });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../docs/index.html"));
});

app.listen(port, () => {
  console.log(`Buddy Moving backend listening on port ${port}`);
});
