const baseUrl = process.env.ANALYZE_TEST_URL || "http://localhost:3000";

async function run() {
  const payload = {
    task: "Plan a friendly moving day checklist for a small apartment.",
    context: "Keep it short and practical.",
  };

  const response = await fetch(`${baseUrl}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  console.log("Status:", response.status);
  console.log("Response:", text);

  if (!response.ok) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error("Analyze test failed:", error);
  process.exitCode = 1;
});
