import { it, expect } from "vitest";
import {
  KATTAI,
  kattaiLabel,
  practiceStep,
  saFrequency,
  talaBeats,
  tanpuraStrings,
} from "../src/web/lib/practice";

it("tunes Sa from kattai, with no 3½ between E and F", () => {
  expect(KATTAI.map((k) => k.kattai)).toEqual([
    1, 1.5, 2, 2.5, 3, 4, 4.5, 5, 5.5, 6, 6.5, 7,
  ]);
  expect(kattaiLabel(4.5)).toBe("4½ · F♯");
  expect(kattaiLabel(5)).toBe("5 · G");
  expect(saFrequency(1)).toBeCloseTo(130.81, 1);
  expect(saFrequency(5)).toBeCloseTo(196.0, 1);
  expect(saFrequency(6)).toBeCloseTo(220.0, 1);
});

it("strings the tanpura Pa–Sa–Sa–low Sa, and Ma for ragas without Pa", () => {
  const sa = saFrequency(5);
  expect(tanpuraStrings(5, "Mayamalavagowla").map((s) => s.swara)).toEqual([
    "Pa",
    "Sa",
    "Sa",
    "low Sa",
  ]);
  expect(tanpuraStrings(5)[0].freq).toBeCloseTo(sa * 0.75);
  expect(tanpuraStrings(5)[3].freq).toBeCloseTo(sa / 2);
  const hindolam = tanpuraStrings(5, "Hindolam")[0];
  expect(hindolam.swara).toBe("Ma");
  expect(hindolam.freq).toBeCloseTo((sa * 2) / 3);
});

it("counts the beats of a tala with its sam and angas", () => {
  const adi = talaBeats([4, 2, 2]);
  expect(adi).toHaveLength(8);
  expect(adi.filter((b) => b.angaStart).map((b) => b.index)).toEqual([0, 4, 6]);
  expect(adi.filter((b) => b.sam).map((b) => b.index)).toEqual([0]);
  const rupaka = talaBeats([2, 4]);
  expect(rupaka.filter((b) => b.angaStart).map((b) => b.index)).toEqual([0, 2]);
});

it("paces the swaras at first, second and third speed against the beat", () => {
  expect(practiceStep(0, 8, 1, 16)).toEqual({ beat: 0, round: 0, swara: 0 });
  expect(practiceStep(2.5, 8, 1, 16)).toMatchObject({ beat: 2, swara: 2 });
  expect(practiceStep(2.5, 8, 2, 16)).toMatchObject({ beat: 2, swara: 5 });
  expect(practiceStep(2.5, 8, 4, 16)).toMatchObject({ beat: 2, swara: 10 });
  expect(practiceStep(9, 8, 1, 16)).toMatchObject({ beat: 1, round: 1 });
  expect(practiceStep(5, 8, 4, 16).swara).toBe(4);
  expect(practiceStep(3, 8, 1, 0).swara).toBe(-1);
});
