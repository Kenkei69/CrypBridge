import { describe, it, expect } from "vitest";
import { units, filterScenarios, outcome } from "../src/model";
describe("redesigned frontend data presentation", () => {
  it("formats token amounts without floating-point rounding", () => {
    expect(units("100000")).toBe("0.10");
    expect(units("1")).toBe("0.000001");
    expect(units("9007199254740993000001")).toBe("9007199254740993.000001");
  });
  it("filters only implemented attack categories and supports duplicate payment alias", () => {
    const categories = ["overpayment", "wrong_party", "replay"];
    expect(filterScenarios(categories, "duplicate")).toEqual(["replay"]);
    expect(filterScenarios(categories, "Prompt Injection")).toEqual([]);
    expect(filterScenarios(categories, "recipient")).toEqual(["wrong_party"]);
  });
  it("does not confuse a guard decision with a defensive test outcome", () => {
    expect(outcome({ actual: "block", passed: true } as any)).toBe("Blocked");
    expect(outcome({ actual: "approve", passed: false } as any)).toBe(
      "Allowed",
    );
    expect(outcome({ actual: "error", passed: false } as any)).toBe("Error");
  });
});
