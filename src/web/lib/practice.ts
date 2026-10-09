/**
 * The arithmetic of the practice room, kept free of audio so it can be tested:
 * shruti in kattai, the tanpura's strings, the beats of a tala, and where a
 * learner is in the swaras at a given speed (kalam).
 */
import { findRaga } from "../components/RagaCover";

/** Shruti in kattai. 1 is C and each half-step adds ½; E to F is a half-step, so 3 is followed by 4. */
export const KATTAI = [
  { kattai: 1, note: "C", semitone: 0 },
  { kattai: 1.5, note: "C♯", semitone: 1 },
  { kattai: 2, note: "D", semitone: 2 },
  { kattai: 2.5, note: "D♯", semitone: 3 },
  { kattai: 3, note: "E", semitone: 4 },
  { kattai: 4, note: "F", semitone: 5 },
  { kattai: 4.5, note: "F♯", semitone: 6 },
  { kattai: 5, note: "G", semitone: 7 },
  { kattai: 5.5, note: "G♯", semitone: 8 },
  { kattai: 6, note: "A", semitone: 9 },
  { kattai: 6.5, note: "A♯", semitone: 10 },
  { kattai: 7, note: "B", semitone: 11 },
] as const;

/** "4½ · F♯" */
export function kattaiLabel(kattai: number) {
  const entry = KATTAI.find((k) => k.kattai === kattai);
  const whole = Math.floor(kattai);
  return `${kattai % 1 ? whole + "½" : whole} · ${entry?.note || "?"}`;
}

/** Sa sits in the octave below middle C (C3 to B3), where a tanpura drones under any voice. */
export function saFrequency(kattai: number) {
  const semitone = KATTAI.find((k) => k.kattai === kattai)?.semitone ?? 7;
  return 130.8128 * 2 ** (semitone / 12);
}

/**
 * One turn of the tanpura: the first string, two middle Sas, then the low Sa.
 * The first string is Pa from the lower octave; ragas without Pa tune it to Ma.
 */
export function tanpuraStrings(kattai: number, raga = "") {
  const sa = saFrequency(kattai);
  const notes = findRaga(raga)?.notes;
  const first =
    notes && !notes.includes(7) && notes.includes(5)
      ? { swara: "Ma", freq: (sa * 4) / 3 / 2 }
      : { swara: "Pa", freq: (sa * 3) / 2 / 2 };
  return [
    { ...first, at: 0, level: 0.16 },
    { swara: "Sa", freq: sa, at: 1.05, level: 0.13 },
    { swara: "Sa", freq: sa, at: 2.1, level: 0.13 },
    { swara: "low Sa", freq: sa / 2, at: 3.15, level: 0.2 },
  ];
}
/** Seconds for one turn of the tanpura, from the first string to the next. */
export const TANPURA_CYCLE = 4.4;

/** The talas the practice room can keep, by their angas. */
export const TALAS: Record<string, number[]> = {
  Adi: [4, 2, 2],
  Rupaka: [2, 4],
  "Misra Chapu": [3, 2, 2],
  "Khanda Chapu": [2, 3],
};

/** Every beat of one avartanam: the sam opens it, and each anga starts a group. */
export function talaBeats(angas: number[]) {
  const beats: { index: number; sam: boolean; angaStart: boolean }[] = [];
  let at = 0;
  for (const anga of angas) {
    for (let i = 0; i < anga; i++)
      beats.push({ index: at + i, sam: at + i === 0, angaStart: i === 0 });
    at += anga;
  }
  return beats;
}

/** Kalam: how many swaras fit in one beat at first, second and third speed. */
export const KALAM = [
  { speed: "1st", perBeat: 1 },
  { speed: "2nd", perBeat: 2 },
  { speed: "3rd", perBeat: 4 },
] as const;

/**
 * Where a learner is, given how many beats have passed since the tala started:
 * the beat in the avartanam, the round, and the swara to sing at this kalam.
 */
export function practiceStep(
  beatsElapsed: number,
  beatsPerCycle: number,
  perBeat: number,
  swaras: number,
) {
  const elapsed = Math.max(0, beatsElapsed);
  const whole = Math.floor(elapsed);
  return {
    beat: beatsPerCycle ? whole % beatsPerCycle : 0,
    round: beatsPerCycle ? Math.floor(whole / beatsPerCycle) : 0,
    swara: swaras ? Math.floor(elapsed * perBeat) % swaras : -1,
  };
}
