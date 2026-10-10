import { Art, type ArtName } from "./Art";

/**
 * Every bit of practice tends a learner's tulsi: a practice task done, a lesson
 * learned or a day of practice logged. Sprout, sapling, a bushy plant, then
 * manjari in flower.
 */
const STAGES: { from: number; name: string; art: ArtName }[] = [
  { from: 0, name: "Sprout", art: "badge-sprout" },
  { from: 3, name: "Sapling", art: "badge-sapling" },
  { from: 10, name: "Bushy tulsi", art: "badge-bushy" },
  { from: 25, name: "Manjari", art: "badge-manjari" },
];

export function growthStage(done: number) {
  let index = 0;
  while (index + 1 < STAGES.length && done >= STAGES[index + 1].from) index++;
  const stage = STAGES[index];
  const next = STAGES[index + 1];
  return {
    stage,
    next,
    progress: next ? (done - stage.from) / (next.from - stage.from) : 1,
  };
}

export function PracticeGrowth({
  done,
  owner = "Your",
  practisedToday,
  onPractised,
}: {
  /** Practice tasks done, lessons learned and days of practice logged. */
  done: number;
  owner?: string;
  practisedToday?: boolean;
  onPractised?: () => void;
}) {
  const { stage, next, progress } = growthStage(done);
  const left = next ? next.from - done : 0;
  return (
    <div className="practice-growth">
      <Art name={stage.art} size={112} />
      <div>
        <span className="eyebrow">{owner} tulsi</span>
        <strong>{stage.name}</strong>
        <p>
          {next
            ? `${left} more ${left === 1 ? "practice" : "practices"} until it grows into a ${next.name.toLowerCase()}.`
            : "In full flower. Keep tending it."}
        </p>
        <div
          className="growth-meter"
          role="progressbar"
          aria-label={next ? `Growth towards ${next.name}` : "Fully grown"}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <span style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <small>
          {done} {done === 1 ? "practice" : "practices"} so far
        </small>
        {onPractised && (
          <button
            type="button"
            className="button secondary practice-today"
            disabled={practisedToday}
            onClick={onPractised}
          >
            {practisedToday ? "Practised today ✓" : "I practised today"}
          </button>
        )}
      </div>
    </div>
  );
}
