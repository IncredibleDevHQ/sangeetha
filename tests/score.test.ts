import { it, expect } from "vitest";
import { activeCue } from "../src/shared/score";
it("follows exact interval boundaries, gaps and seeks in either direction", () => {
  const cues = [
    { start: 0, end: 0.5, note: "S" },
    { start: 0.5, end: 1, note: "R" },
    { start: 2, end: 3, note: "G" },
  ];
  expect([0, 0.49, 0.5, 1, 2, 3, 0.2].map((t) => activeCue(cues, t))).toEqual([
    0, 0, 1, -1, 2, -1, 0,
  ]);
  expect(activeCue([], 0)).toBe(-1);
});
