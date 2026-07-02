// @vitest-environment node
import { describe, it, expect } from "vitest";
import { FLAG_DEFAULTS, flagValue } from "./defaults";

describe("lib/flags/defaults", () => {
  it("declares population_world_map default TRUE (the ONE Wave-9 consumer — zero behavior change until flipped)", () => {
    expect(FLAG_DEFAULTS.population_world_map).toBe(true);
  });

  it("missing row + declared default → the default", () => {
    expect(flagValue("population_world_map")).toBe(true);
    expect(flagValue("population_world_map", null)).toBe(true);
    expect(flagValue("population_world_map", undefined)).toBe(true);
  });

  it("missing row + UNDECLARED key → false", () => {
    expect(flagValue("some_flag_nobody_declared")).toBe(false);
  });

  it("a DB row wins over the declared default", () => {
    expect(flagValue("population_world_map", { enabled: false })).toBe(false);
    expect(flagValue("some_flag_nobody_declared", { enabled: true })).toBe(true);
  });
});
