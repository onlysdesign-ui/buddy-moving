const { createEmptyCaseFile, mergeCaseFile } = require("../caseFile/updateCaseFile");

describe("mergeCaseFile", () => {
  it("merges without removing existing fields", () => {
    const base = createEmptyCaseFile();
    base.task_summary.problem = "Reduce moving planning chaos";
    base.task_summary.constraints.tech = ["No mobile app"];

    const patch = {
      task_summary: {
        outcome: "Users can plan moves with fewer missed steps",
      },
    };

    const merged = mergeCaseFile(base, patch);

    expect(merged.task_summary.problem).toBe("Reduce moving planning chaos");
    expect(merged.task_summary.outcome).toBe(
      "Users can plan moves with fewer missed steps"
    );
    expect(merged.task_summary.constraints.tech).toEqual(["No mobile app"]);
  });

  it("dedupes string arrays case-insensitively", () => {
    const base = createEmptyCaseFile();
    base.assumptions = ["Users plan on mobile"];

    const patch = {
      assumptions: ["users plan on mobile", "Limited time windows"],
    };

    const merged = mergeCaseFile(base, patch);

    expect(merged.assumptions).toEqual([
      "Users plan on mobile",
      "Limited time windows",
    ]);
  });

  it("dedupes directions by id", () => {
    const base = createEmptyCaseFile();
    base.solution_space.directions = [
      { id: "A", name: "Checklist-first", tradeoffs: ["Less flexibility"] },
    ];

    const patch = {
      solution_space: {
        directions: [
          { id: "a", name: "Checklist-first", what_to_test_first: ["Adoption"] },
          { id: "B", name: "Concierge planning" },
        ],
      },
    };

    const merged = mergeCaseFile(base, patch);

    expect(merged.solution_space.directions).toHaveLength(2);
    const updated = merged.solution_space.directions.find(
      (item) => item.id === "A" || item.id === "a"
    );
    expect(updated.tradeoffs).toEqual(["Less flexibility"]);
    expect(updated.what_to_test_first).toEqual(["Adoption"]);
  });

  it("preserves recommended_direction_id when patch is empty", () => {
    const base = createEmptyCaseFile();
    base.decision.recommended_direction_id = "B";

    const patch = {
      decision: {
        recommended_direction_id: "",
      },
    };

    const merged = mergeCaseFile(base, patch);

    expect(merged.decision.recommended_direction_id).toBe("B");
  });
});
