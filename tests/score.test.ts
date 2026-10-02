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

it("groups legacy notes in fours and respects mixed teacher-authored bars", async () => {
  const { groupCues } = await import("../src/shared/score");
  const cues = Array.from({ length: 10 }, (_, i) => ({
    note: String(i),
    start: i,
    end: i + 1,
  }));
  expect(groupCues(cues).map((g) => g.length)).toEqual([4, 4, 2]);
  const mixed = cues.map((c, i) => ({ ...c, barStart: [0, 3, 7].includes(i) }));
  expect(groupCues(mixed).map((g) => g.length)).toEqual([3, 4, 3]);
  expect(
    groupCues(mixed).findIndex((g) =>
      g.some((n) => n.index === activeCue(mixed, 3)),
    ),
  ).toBe(1);
  expect(groupCues([])).toEqual([]);
});
