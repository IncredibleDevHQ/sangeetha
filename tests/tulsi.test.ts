import { it, expect } from "vitest";
import { findRaga, findTala } from "../src/web/components/RagaCover";
import { growthStage } from "../src/web/components/Growth";
import { formatRange, formatWhen, zoneName } from "../src/web/lib/when";

it("recognises the common spellings of a raga and never guesses an unknown one", () => {
  for (const name of [
    "Mayamalavagowla",
    "Maya Malava Gowla",
    "mayamalavagaula",
  ])
    expect(findRaga(name)?.name).toBe("Mayamalavagowla");
  expect(findRaga("Thodi")?.name).toBe("Todi");
  expect(findRaga("Dheerasankarabharanam")?.name).toBe("Shankarabharanam");
  expect(findRaga("Keeravani")?.notes).toEqual([0, 2, 3, 5, 7, 8, 11]);
  expect(findRaga("Hamsadwani")?.notes).toEqual([0, 2, 4, 7, 11]);
  expect(findRaga("A raga we have not met")).toBeUndefined();
  expect(findRaga("")).toBeUndefined();
});

it("keeps every raga's swaras on the twelve-step circle, starting from Sa", () => {
  const names = ["Kalyani", "Mohanam", "Hindolam", "Sowrashtram", "Nata"];
  for (const name of names) {
    const notes = findRaga(name)!.notes;
    expect(notes[0]).toBe(0);
    expect(notes.every((n, i) => n >= 0 && n < 12 && (!i || n > notes[i - 1]))).toBe(true);
  }
});

it("reads the angas of a tala", () => {
  expect(findTala("Adi")?.angas).toEqual([4, 2, 2]);
  expect(findTala("Roopakam")?.angas).toEqual([2, 4]);
  expect(findTala("Mishra Chapu")?.angas).toEqual([3, 2, 2]);
  expect(findTala("Khanda Chapu")?.angas).toEqual([2, 3]);
  expect(findTala("")).toBeUndefined();
});

it("grows a learner's tulsi as practice is completed", () => {
  expect(growthStage(0)).toMatchObject({
    stage: { name: "Sprout" },
    next: { name: "Sapling" },
    progress: 0,
  });
  expect(growthStage(2).progress).toBeCloseTo(2 / 3);
  expect(growthStage(3).stage.name).toBe("Sapling");
  expect(growthStage(10).stage.name).toBe("Bushy tulsi");
  expect(growthStage(40)).toMatchObject({
    stage: { name: "Manjari" },
    next: undefined,
    progress: 1,
  });
});

it("writes dates and times one way, on the school's clock or the viewer's", () => {
  expect(formatWhen("2026-10-10", "date")).toMatch(/^10 Oct/);
  expect(formatWhen("2026-10-10", "day")).toMatch(/^Sat 10 Oct/);
  expect(formatWhen("2026-10-10T04:30:00Z", "dayTime", "school")).toMatch(
    /^Sat 10 Oct · 10:00\sam/,
  );
  expect(
    formatRange("2026-10-10T04:30:00Z", "2026-10-10T05:30:00Z", "school"),
  ).toMatch(/^Sat 10 Oct · 10:00–11:00\sam/);
  expect(zoneName("Asia/Calcutta")).toBe("India time");
  expect(zoneName("Europe/London")).toBe("London time");
  expect(zoneName("America/New_York")).toBe("New York time");
  expect(formatWhen("", "date")).toBe("");
});
