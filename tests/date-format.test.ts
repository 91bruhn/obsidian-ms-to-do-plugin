import { afterEach, describe, expect, it, vi } from "vitest";
import { formatLocalIsoDateTime } from "../src/date-format";

afterEach(() => vi.restoreAllMocks());

describe("formatLocalIsoDateTime", () => {
  it("uses a positive local offset", () => {
    vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(-120);
    expect(formatLocalIsoDateTime("2026-07-09T02:07:52.536Z")).toMatch(
      /^2026-07-09T\d{2}:07:52\.536\+02:00$/
    );
  });

  it("uses a negative local offset", () => {
    vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(300);
    expect(formatLocalIsoDateTime("2026-01-09T02:07:52.536Z")).toMatch(/-05:00$/);
  });

  it("rejects invalid values", () => {
    expect(() => formatLocalIsoDateTime("not-a-date")).toThrow("Ungültiger Erstellungszeitpunkt");
  });
});
