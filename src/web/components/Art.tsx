/** Tulsi artwork: self-contained SVGs in /art. Decorative, so hidden from assistive tech. */
export type ArtName =
  | "all-caught-up"
  | "badge-bushy"
  | "badge-manjari"
  | "badge-sapling"
  | "badge-sprout"
  | "courtyard-dawn"
  | "growth-garden"
  | "icon-calendar"
  | "icon-events"
  | "icon-families"
  | "icon-feedback"
  | "icon-fees"
  | "icon-home"
  | "icon-learn"
  | "icon-practice"
  | "icon-record"
  | "no-classes"
  | "practice-corner"
  | "recital-stage"
  | "tala-ring"
  | "welcome";

export function Art({
  name,
  size = 120,
  className = "",
}: {
  name: ArtName;
  size?: number;
  className?: string;
}) {
  return (
    <img
      className={`tulsi-art ${className}`.trim()}
      src={`/art/${name}.svg`}
      width={size}
      height={size}
      alt=""
      decoding="async"
    />
  );
}

/** Artwork for a first-run or cleared list, above its heading. */
export function EmptyArt({ name }: { name: ArtName }) {
  return <Art name={name} className="empty-art" />;
}
