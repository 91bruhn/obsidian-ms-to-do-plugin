import { describe, expect, it } from "vitest";
import { sanitizePathSegment, stableShortHash, withStableSuffix } from "../src/path-utils";

describe("path utilities", () => {
  it("sanitizes invalid and reserved Windows names", () => {
    expect(sanitizePathSegment(' Projekt: A/B? ', "Fallback")).toBe("Projekt- A-B-");
    expect(sanitizePathSegment("CON", "Fallback")).toBe("_CON");
    expect(sanitizePathSegment("...", "Fallback")).toBe("Fallback");
  });

  it("creates deterministic collision suffixes", () => {
    expect(stableShortHash("same-id")).toBe(stableShortHash("same-id"));
    expect(stableShortHash("same-id")).not.toBe(stableShortHash("other-id"));
    expect(withStableSuffix("Task", "same-id")).toMatch(/^Task \([a-z0-9]{7}\)$/);
  });
});
