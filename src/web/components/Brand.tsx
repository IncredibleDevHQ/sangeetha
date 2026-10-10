/** Tulsi brand: a tulsi sprig with a saffron bud — the diya's flame, the sun, the sam. */
const LEAVES: [number, number, number, number][] = [
  // [y, length, width, angle from horizontal]
  [32, 12.5, 5.2, 36],
  [22.5, 9.5, 4.1, 42],
];

function leaf(length: number, width: number) {
  const L = length;
  const W = width;
  return `M0 0 C${L * 0.2} ${-W} ${L * 0.7} ${-W * 0.9} ${L} 0 C${L * 0.7} ${W * 0.9} ${L * 0.2} ${W} 0 0 Z`;
}

export function TulsiMark({
  size = 34,
  tile = "var(--sg-accent)",
  sprig = "#fff",
  className = "",
}: {
  size?: number;
  tile?: string;
  sprig?: string;
  className?: string;
}) {
  return (
    <svg
      className={`tulsi-mark ${className}`}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="48" height="48" rx="14" style={{ fill: tile }} />
      <path
        d="M24 41 L24 15"
        strokeLinecap="round"
        style={{ fill: "none", stroke: sprig, strokeWidth: 2.8 }}
      />
      {LEAVES.flatMap(([y, length, width, angle]) =>
        [-180 + angle, -angle].map((rotate) => (
          <path
            key={`${y}-${rotate}`}
            d={leaf(length, width)}
            style={{ fill: sprig }}
            transform={`translate(24 ${y}) rotate(${rotate})`}
          />
        )),
      )}
      <circle cx="24" cy="11" r="3.6" style={{ fill: "var(--sg-warm)" }} />
    </svg>
  );
}

export function Wordmark({ detail }: { detail?: string }) {
  return (
    <span className="tulsi-wordmark">
      tulsi
      {detail && <small>{detail}</small>}
    </span>
  );
}

export function Brand({ detail }: { detail?: string }) {
  return (
    <div className="brand">
      <TulsiMark />
      <Wordmark detail={detail} />
    </div>
  );
}
