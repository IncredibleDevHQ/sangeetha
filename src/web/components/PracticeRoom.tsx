import { useEffect, useId, useRef, useState } from "react";
import { findTala } from "./RagaCover";
import {
  KALAM,
  KATTAI,
  TALAS,
  kattaiLabel,
  practiceStep,
  talaBeats,
} from "../lib/practice";
import { PracticeEngine } from "../lib/practiceAudio";

/** The avartanam as a ring of beads: the sam in saffron, each anga starting a little fuller. */
function BeatRing({ angas, beat }: { angas: number[]; beat: number }) {
  const beats = talaBeats(angas);
  return (
    <svg
      className="beat-ring"
      viewBox="0 0 120 120"
      width="132"
      height="132"
      aria-hidden="true"
      focusable="false"
    >
      <circle className="beat-ring-track" cx="60" cy="60" r="44" />
      {beats.map((b) => {
        const angle = (-90 + (b.index * 360) / beats.length) * (Math.PI / 180);
        const now = b.index === beat;
        return (
          <circle
            key={b.index}
            className={`beat-bead ${b.sam ? "is-sam" : ""} ${b.angaStart ? "is-anga" : ""} ${now ? "is-now" : ""}`}
            cx={(60 + 44 * Math.cos(angle)).toFixed(1)}
            cy={(60 + 44 * Math.sin(angle)).toFixed(1)}
            r={b.sam ? 8 : b.angaStart ? 6.5 : 5}
          />
        );
      })}
      <text x="60" y="58" className="beat-ring-count">
        {beat >= 0 ? beat + 1 : "·"}
      </text>
      <text x="60" y="74" className="beat-ring-label">
        {beat >= 0 ? "of " + beats.length : "beats"}
      </text>
    </svg>
  );
}

/**
 * Practise along with a lesson: a tanpura at the learner's shruti, the lesson's
 * tala at a chosen tempo, and the swaras paced at first, second or third speed.
 * Sound starts only from these buttons and stops when the lesson closes.
 */
export function PracticeRoom({
  raga,
  tala,
  swaras,
  onPosition,
}: {
  raga: string;
  tala: string;
  /** How many timed swaras the lesson has, for the follow-along. */
  swaras: number;
  /** The swara and beat to highlight while the tala plays; -1 when it stops. */
  onPosition: (swara: number, beat: number) => void;
}) {
  const engine = useRef<PracticeEngine | null>(null);
  const report = useRef(onPosition);
  report.current = onPosition;
  const group = useId();
  const lessonTala = findTala(tala)?.name;
  const [kattai, setKattai] = useState(5),
    [drone, setDrone] = useState(false),
    [talaName, setTalaName] = useState(
      lessonTala && TALAS[lessonTala] ? lessonTala : "Adi",
    ),
    [bpm, setBpm] = useState(60),
    [perBeat, setPerBeat] = useState(1),
    [keeping, setKeeping] = useState(false),
    [beat, setBeat] = useState(-1),
    [error, setError] = useState("");
  const angas = TALAS[talaName];
  const sound = () => {
    if (!engine.current) engine.current = new PracticeEngine();
    return engine.current;
  };
  // Everything stops when the lesson or recording closes.
  useEffect(
    () => () => {
      engine.current?.dispose();
      engine.current = null;
    },
    [],
  );
  useEffect(() => {
    if (!keeping) {
      setBeat(-1);
      report.current(-1, -1);
      return;
    }
    let frame = 0,
      shown = { beat: -2, swara: -2 };
    const follow = () => {
      const elapsed = engine.current?.beatsElapsed() ?? -1;
      if (elapsed >= 0) {
        const step = practiceStep(
          elapsed,
          talaBeats(angas).length,
          perBeat,
          swaras,
        );
        if (step.beat !== shown.beat || step.swara !== shown.swara) {
          setBeat(step.beat);
          report.current(step.swara, step.beat);
          shown = step;
        }
      }
      frame = requestAnimationFrame(follow);
    };
    frame = requestAnimationFrame(follow);
    return () => cancelAnimationFrame(frame);
  }, [keeping, perBeat, swaras, talaName]);
  const attempt = (work: () => void) => {
    setError("");
    try {
      work();
    } catch {
      setError("Sound couldn’t start in this browser.");
    }
  };
  return (
    <section className="practice-room" aria-labelledby="practice-room-title">
      <div className="practice-room-heading">
        <div>
          <span className="eyebrow">Practice room</span>
          <h5 id="practice-room-title">Sing along with tanpura and tala</h5>
        </div>
        <BeatRing angas={angas} beat={beat} />
      </div>
      <div className="practice-controls">
        <div className="practice-control">
          <button
            type="button"
            className="practice-toggle"
            aria-pressed={drone}
            onClick={() =>
              attempt(() => {
                if (drone) sound().stopTanpura();
                else sound().startTanpura(kattai, raga);
                setDrone(!drone);
              })
            }
          >
            {drone ? "Stop tanpura" : "Tanpura"}
          </button>
          <label>
            Shruti
            <select
              value={kattai}
              onChange={(e) => {
                const next = Number(e.target.value);
                setKattai(next);
                engine.current?.retuneTanpura(next, raga);
              }}
            >
              {KATTAI.map((k) => (
                <option key={k.kattai} value={k.kattai}>
                  {kattaiLabel(k.kattai)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="practice-control">
          <button
            type="button"
            className="practice-toggle"
            aria-pressed={keeping}
            onClick={() =>
              attempt(() => {
                if (keeping) sound().stopTala();
                else sound().startTala(angas, bpm);
                setKeeping(!keeping);
              })
            }
          >
            {keeping ? "Stop tala" : "Tala"}
          </button>
          <label>
            Tala
            <select
              value={talaName}
              onChange={(e) => {
                const next = e.target.value;
                setTalaName(next);
                if (keeping) sound().startTala(TALAS[next], bpm);
              }}
            >
              {Object.keys(TALAS).map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <label className="practice-tempo">
            Tempo
            <input
              type="range"
              min="40"
              max="120"
              step="2"
              value={bpm}
              onChange={(e) => {
                const next = Number(e.target.value);
                setBpm(next);
                engine.current?.setTempo(next);
              }}
            />
            <output>{bpm} beats a minute</output>
          </label>
        </div>
        <fieldset className="practice-control practice-kalam">
          <legend>Speed</legend>
          {KALAM.map((k) => (
            <label key={k.speed}>
              <input
                type="radio"
                name={group + "-kalam"}
                value={k.perBeat}
                checked={perBeat === k.perBeat}
                onChange={() => setPerBeat(k.perBeat)}
              />
              <span>
                {k.speed}
                <small>
                  {k.perBeat} {k.perBeat === 1 ? "swara" : "swaras"} a beat
                </small>
              </span>
            </label>
          ))}
        </fieldset>
      </div>
      <p className="practice-hint">
        {keeping
          ? swaras
            ? "Follow the highlighted swara: it moves with the tala at your speed."
            : "Keep the tala with your hand: the sam is the saffron bead."
          : lessonTala
            ? `This lesson is in ${lessonTala} tala. Start the tala to practise the swaras at your own speed.`
            : "Start the tala to practise at your own speed."}
      </p>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
