// @vitest-environment node
import { describe, it, expect } from "vitest";
import { APP_STATUS_ORDER, canTransition, nextStatus } from "./state";

describe("application state machine", () => {
  it("orders statuses DRAFT → ATTESTED → OATH_ACCEPTED → WITNESSED → SEALED", () => {
    expect(APP_STATUS_ORDER).toEqual(["DRAFT", "ATTESTED", "OATH_ACCEPTED", "WITNESSED", "SEALED"]);
  });

  it("allows a single forward step", () => {
    expect(canTransition("DRAFT", "ATTESTED")).toBe(true);
    expect(canTransition("ATTESTED", "OATH_ACCEPTED")).toBe(true);
    expect(canTransition("OATH_ACCEPTED", "WITNESSED")).toBe(true);
    expect(canTransition("WITNESSED", "SEALED")).toBe(true);
  });

  it("rejects skipping ahead more than one step", () => {
    expect(canTransition("DRAFT", "SEALED")).toBe(false);
    expect(canTransition("DRAFT", "OATH_ACCEPTED")).toBe(false);
  });

  it("rejects going backward", () => {
    expect(canTransition("ATTESTED", "DRAFT")).toBe(false);
    expect(canTransition("SEALED", "WITNESSED")).toBe(false);
  });

  it("allows re-entering the same step (idempotent attest/oath)", () => {
    expect(canTransition("DRAFT", "DRAFT")).toBe(true);
    expect(canTransition("ATTESTED", "ATTESTED")).toBe(true);
  });

  it("nextStatus advances by one and is null past SEALED", () => {
    expect(nextStatus("WITNESSED")).toBe("SEALED");
    expect(nextStatus("DRAFT")).toBe("ATTESTED");
    expect(nextStatus("SEALED")).toBeNull();
  });
});
