const {
  createEmptyCaseFile,
  mergeCaseFile,
} = require("../caseFile/updateCaseFile");

describe("mergeCaseFile", () => {
  it("merges arrays without duplicates and updates existing entries", () => {
    const base = createEmptyCaseFile();
    base.success_criteria = [
      { criterion: "Reduce planning confusion", type: "must", how_to_measure_later: "Interview feedback" },
    ];

    const patch = {
      success_criteria: [
        { criterion: "Reduce planning confusion", how_to_measure_later: "Support tickets tagged confusion" },
        { criterion: "Users feel in control", type: "should", how_to_measure_later: "Post-task survey sentiment" },
      ],
    };

    const merged = mergeCaseFile(base, patch);

    expect(merged.success_criteria).toHaveLength(2);
    const updated = merged.success_criteria.find(
      (item) => item.criterion === "Reduce planning confusion"
    );
    expect(updated).toEqual({
      criterion: "Reduce planning confusion",
      type: "must",
      how_to_measure_later: "Support tickets tagged confusion",
    });
  });

  it("ignores empty fields and merges string arrays uniquely", () => {
    const base = createEmptyCaseFile();
    base.task_summary.problem = "Build a moving planner";
    base.task_summary.non_goals = ["Home buying flows"];
    base.assumptions = [{ text: "Users have limited time", impact: "Need speed", confidence: "medium" }];

    const patch = {
      task_summary: {
        problem: "",
        non_goals: ["Home buying flows", "Corporate relocations"],
      },
      assumptions: [
        { text: "Users have limited time", impact: "Need speed", confidence: "medium" },
        { text: "Mobile-first usage", impact: "Prioritize phone UX", confidence: "high" },
      ],
    };

    const merged = mergeCaseFile(base, patch);

    expect(merged.task_summary.problem).toBe("Build a moving planner");
    expect(merged.task_summary.non_goals).toEqual([
      "Home buying flows",
      "Corporate relocations",
    ]);
    expect(merged.assumptions).toHaveLength(2);
  });
});
