import { describe, expect, it } from "vitest";
import { describeRunProgress, RUN_STEPS, runStepStates, stageIndex } from "@/components/app/run-stages";
import { formatRating, isRunActive } from "@/components/app/labels";

describe("stageIndex", () => {
  it("maps stages onto the five visible steps", () => {
    expect(stageIndex("queued")).toBe(-1);
    expect(stageIndex("fetching")).toBe(0);
    expect(stageIndex("storing")).toBe(1);
    expect(stageIndex("clustering")).toBe(2);
    expect(stageIndex("diffing")).toBe(3);
    expect(stageIndex("alerting")).toBe(4);
    expect(stageIndex("filing")).toBe(4);
    expect(stageIndex("done")).toBe(RUN_STEPS.length);
  });
});

describe("runStepStates", () => {
  it("marks earlier steps done and the current one active while running", () => {
    expect(runStepStates("clustering", "running")).toEqual(["done", "done", "active", "pending", "pending"]);
  });

  it("shows nothing active for a queued run", () => {
    expect(runStepStates("queued", "queued")).toEqual(Array(5).fill("pending"));
  });

  it("marks every step done when the run succeeded, whatever the stored stage", () => {
    expect(runStepStates("alerting", "succeeded")).toEqual(Array(5).fill("done"));
  });

  it("marks the failing step and leaves later ones pending", () => {
    expect(runStepStates("diffing", "failed")).toEqual(["done", "done", "done", "failed", "pending"]);
    expect(runStepStates("queued", "failed")).toEqual(["failed", "pending", "pending", "pending", "pending"]);
  });

  it("shows skipped steps after storing for a skipped run", () => {
    expect(runStepStates("done", "skipped")).toEqual(["done", "done", "skipped", "skipped", "skipped"]);
    expect(runStepStates("clustering", "skipped")).toEqual(["done", "done", "skipped", "skipped", "skipped"]);
  });
});

describe("describeRunProgress", () => {
  it("names the current step for screen readers", () => {
    expect(describeRunProgress("storing", "running")).toBe("Saving new feedback (step 2 of 5).");
    expect(describeRunProgress("queued", "queued")).toBe("Waiting to start.");
    expect(describeRunProgress("done", "succeeded")).toBe("Run finished.");
  });
});

describe("labels", () => {
  it("formats ratings as words", () => {
    expect(formatRating(2)).toBe("2 of 5");
    expect(formatRating(4.6)).toBe("5 of 5");
    expect(formatRating(null)).toBeNull();
  });

  it("knows which run statuses are active", () => {
    expect(isRunActive("queued")).toBe(true);
    expect(isRunActive("running")).toBe(true);
    expect(isRunActive("succeeded")).toBe(false);
    expect(isRunActive("skipped")).toBe(false);
  });
});
