const {
  createEmptyCaseFile,
  mergeCaseFile,
} = require("../caseFile/updateCaseFile");

describe("mergeCaseFile", () => {
  it("merges arrays without duplicates and updates existing entries", () => {
    const base = createEmptyCaseFile();
    base.success_metrics = [
      { name: "Activation", type: "leading", how_to_measure: "Signup rate", target: "30%" },
    ];

    const patch = {
      success_metrics: [
        { name: "Activation", how_to_measure: "Activated accounts", target: "35%" },
        { name: "Retention", type: "lagging", how_to_measure: "Day-30 retention", target: "20%" },
      ],
    };

    const merged = mergeCaseFile(base, patch);

    expect(merged.success_metrics).toHaveLength(2);
    const activation = merged.success_metrics.find((item) => item.name === "Activation");
    expect(activation).toEqual({
      name: "Activation",
      type: "leading",
      how_to_measure: "Activated accounts",
      target: "35%",
    });
  });

  it("ignores empty fields and merges string arrays uniquely", () => {
    const base = createEmptyCaseFile();
    base.task_summary.short = "Build a moving planner";
    base.task_summary.assumptions = ["Users have limited time"];

    const patch = {
      task_summary: {
        short: "",
        assumptions: ["Users have limited time", "Mobile-first usage"],
      },
      constraints: {
        product_constraints: [],
      },
    };

    const merged = mergeCaseFile(base, patch);

    expect(merged.task_summary.short).toBe("Build a moving planner");
    expect(merged.task_summary.assumptions).toEqual([
      "Users have limited time",
      "Mobile-first usage",
    ]);
    expect(merged.constraints.product_constraints).toEqual([]);
  });
});
