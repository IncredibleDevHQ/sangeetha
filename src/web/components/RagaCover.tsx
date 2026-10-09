/**
 * Generative raga covers: every raga gets artwork drawn from its own shape.
 *
 * The twelve swarasthanas sit on a circle with Sa at the top and each swara of
 * the raga becomes a petal, so Mayamalavagowla's half-steps pair up and Mohanam
 * opens into five. The tala ring (Adi 4+2+2, Rupaka 2+4) holds the flower and
 * Sa wears the saffron spark. A raga we don't know is never guessed: it gets the
 * tala ring alone, or a tulsi sprig when the tala is unknown too. Covers are
 * decorative: the raga and tala are always written beside them.
 */

type Tint = "sage" | "sand" | "clay" | "moss" | "haldi" | "stone";

// Swaras as semitones from Sa: R1 1, R2/G1 2, R3/G2 3, G3 4, M1 5, M2 6, P 7,
// D1 8, D2/N1 9, D3/N2 10, N3 11.
const RAGAS: Record<string, { name: string; notes: number[]; tint?: Tint }> = {
  mayamalavagaula: { name: "Mayamalavagowla", notes: [0, 1, 4, 5, 7, 8, 11], tint: "sage" },
  malahari: { name: "Malahari", notes: [0, 1, 4, 5, 7, 8], tint: "sand" },
  mohanam: { name: "Mohanam", notes: [0, 2, 4, 7, 9], tint: "clay" },
  hamsadhvani: { name: "Hamsadhwani", notes: [0, 2, 4, 7, 11], tint: "haldi" },
  saurastram: { name: "Sowrashtram", notes: [0, 1, 4, 5, 7, 9, 11], tint: "moss" },
  sankarabharanam: { name: "Shankarabharanam", notes: [0, 2, 4, 5, 7, 9, 11], tint: "stone" },
  kalyani: { name: "Kalyani", notes: [0, 2, 4, 6, 7, 9, 11] },
  kharaharapriya: { name: "Kharaharapriya", notes: [0, 2, 3, 5, 7, 9, 10] },
  harikambhoji: { name: "Harikambhoji", notes: [0, 2, 4, 5, 7, 9, 10] },
  natabhairavi: { name: "Natabhairavi", notes: [0, 2, 3, 5, 7, 8, 10] },
  todi: { name: "Todi", notes: [0, 1, 3, 5, 7, 8, 10] },
  kiravani: { name: "Keeravani", notes: [0, 2, 3, 5, 7, 8, 11] },
  charukesi: { name: "Charukesi", notes: [0, 2, 4, 5, 7, 8, 10] },
  simhendramadhyamam: { name: "Simhendramadhyamam", notes: [0, 2, 3, 6, 7, 8, 11] },
  sanmukhapriya: { name: "Shanmukhapriya", notes: [0, 2, 3, 6, 7, 8, 10] },
  pantuvarali: { name: "Pantuvarali", notes: [0, 1, 4, 6, 7, 8, 11] },
  chakravakam: { name: "Chakravakam", notes: [0, 1, 4, 5, 7, 9, 10] },
  latangi: { name: "Latangi", notes: [0, 2, 4, 6, 7, 8, 11] },
  vachaspati: { name: "Vachaspati", notes: [0, 2, 4, 6, 7, 9, 10] },
  gamanasrama: { name: "Gamanashrama", notes: [0, 1, 4, 6, 7, 9, 11] },
  dharmavati: { name: "Dharmavati", notes: [0, 2, 3, 6, 7, 9, 11] },
  hemavati: { name: "Hemavati", notes: [0, 2, 3, 6, 7, 9, 10] },
  subhapantuvarali: { name: "Subhapantuvarali", notes: [0, 1, 3, 6, 7, 8, 11] },
  gaurimanohari: { name: "Gowrimanohari", notes: [0, 2, 3, 5, 7, 9, 11] },
  sarasangi: { name: "Sarasangi", notes: [0, 2, 4, 5, 7, 8, 11] },
  natakapriya: { name: "Natakapriya", notes: [0, 1, 3, 5, 7, 9, 10] },
  ramapriya: { name: "Ramapriya", notes: [0, 1, 4, 6, 7, 9, 10] },
  hindolam: { name: "Hindolam", notes: [0, 3, 5, 8, 10] },
  abhogi: { name: "Abhogi", notes: [0, 2, 3, 5, 9] },
  madhyamavati: { name: "Madhyamavati", notes: [0, 2, 5, 7, 10] },
  suddhasaveri: { name: "Shuddha Saveri", notes: [0, 2, 5, 7, 9] },
  suddhadhanyasi: { name: "Shuddha Dhanyasi", notes: [0, 3, 5, 7, 10] },
  revati: { name: "Revati", notes: [0, 1, 5, 7, 10] },
  amritavarsini: { name: "Amritavarshini", notes: [0, 4, 6, 7, 11] },
  bhupalam: { name: "Bhoopalam", notes: [0, 1, 3, 7, 8] },
  sivaranjani: { name: "Shivaranjani", notes: [0, 2, 3, 7, 9] },
  valaji: { name: "Valaji", notes: [0, 4, 7, 9, 10] },
  bilahari: { name: "Bilahari", notes: [0, 2, 4, 5, 7, 9, 11] },
  arabhi: { name: "Arabhi", notes: [0, 2, 4, 5, 7, 9, 11] },
  saveri: { name: "Saveri", notes: [0, 1, 4, 5, 7, 8, 11] },
  gaula: { name: "Gowla", notes: [0, 1, 4, 5, 7, 11] },
  nata: { name: "Nata", notes: [0, 3, 4, 5, 7, 10, 11] },
  vasanta: { name: "Vasantha", notes: [0, 1, 4, 5, 9, 11] },
  kedaragaula: { name: "Kedaragowla", notes: [0, 2, 4, 5, 7, 9, 10] },
  anandabhairavi: { name: "Anandabhairavi", notes: [0, 2, 3, 5, 7, 9, 10] },
};
const RAGA_ALIASES: Record<string, string> = {
  dhirasankarabharanam: "sankarabharanam",
  harikamboji: "harikambhoji",
  mechakalyani: "kalyani",
  hanumatodi: "todi",
  kamavardhini: "pantuvarali",
  hamsadvani: "hamsadhvani",
  amrutavarsini: "amritavarsini",
  natai: "nata",
};
const TALAS: Record<string, { name: string; angas: number[] }> = {
  adi: { name: "Adi", angas: [4, 2, 2] },
  rupaka: { name: "Rupaka", angas: [2, 4] },
  rupakam: { name: "Rupaka", angas: [2, 4] },
  misracapu: { name: "Misra Chapu", angas: [3, 2, 2] },
  khandacapu: { name: "Khanda Chapu", angas: [2, 3] },
};
const TINTS: Tint[] = ["sage", "sand", "clay", "moss", "haldi", "stone"];

/** Folds the common spellings of a name onto one key: Thodi, Todi; Shankarabharanam, Sankarabharanam. */
function fold(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .replace(/th/g, "t")
    .replace(/sh/g, "s")
    .replace(/ch/g, "c")
    .replace(/gh/g, "kh")
    .replace(/ee/g, "i")
    .replace(/oo/g, "u")
    .replace(/aa/g, "a")
    .replace(/ow/g, "au")
    .replace(/w/g, "v")
    .replace(/(.)\1/g, "$1");
}

const RAGA_INDEX = new Map(
  Object.entries(RAGAS).map(([key, raga]) => [fold(key), raga] as const),
);
for (const [alias, key] of Object.entries(RAGA_ALIASES))
  RAGA_INDEX.set(fold(alias), RAGAS[key]);
const TALA_INDEX = new Map(
  Object.entries(TALAS).map(([key, tala]) => [fold(key), tala] as const),
);

export function findRaga(name: string) {
  return name ? RAGA_INDEX.get(fold(name)) : undefined;
}
export function findTala(name: string) {
  return name ? TALA_INDEX.get(fold(name)) : undefined;
}

function tintFor(name: string): Tint {
  let hash = 0;
  for (const c of fold(name)) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return TINTS[hash % TINTS.length];
}

const polar = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return [60 + r * Math.cos(a), 60 + r * Math.sin(a)] as const;
};
const f = (n: number) => n.toFixed(1);
// Paint goes through style rather than presentation attributes, so var() and
// color-mix() resolve in every browser.
const paint = (fill: string, stroke?: string, width?: number) =>
  stroke ? { fill, stroke, strokeWidth: width } : { fill };

function ring(angas: number[], r: number, stroke: string, width: number) {
  const beats = angas.reduce((n, a) => n + a, 0);
  const gap = 9;
  let k = 0;
  return angas.map((anga) => {
    const a0 = -90 + (k * 360) / beats + gap / 2;
    const a1 = -90 + ((k + anga) * 360) / beats - gap / 2;
    k += anga;
    const [x0, y0] = polar(r, a0);
    const [x1, y1] = polar(r, a1);
    return (
      <path
        key={a0}
        d={`M${f(x0)} ${f(y0)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${f(x1)} ${f(y1)}`}
        strokeLinecap="round"
        style={paint("none", stroke, width)}
      />
    );
  });
}

export function RagaCover({
  raga = "",
  tala = "",
  size = 56,
  className = "",
}: {
  raga?: string;
  tala?: string;
  size?: number;
  className?: string;
}) {
  const known = findRaga(raga);
  const cycle = findTala(tala);
  const tint = known?.tint || tintFor(raga || tala || "tulsi");
  const bg = `var(--cv-${tint})`;
  const ink = `var(--cv-${tint}-ink)`;
  const detail = size >= 72;
  const rx = ((detail ? 14 : 10) * 120) / size;
  const line = detail ? 1.5 : 2.6;
  let art;
  if (known) {
    const notes = known.notes;
    const tip = 41;
    const side = 20;
    const spread = notes.length > 5 ? 17 : 21;
    const beats = cycle?.angas.reduce((n, a) => n + a, 0) || 0;
    art = (
      <>
        {cycle &&
          ring(
            cycle.angas,
            49,
            `color-mix(in srgb, ${ink} 34%, transparent)`,
            detail ? 1.6 : 3,
          )}
        {notes.map((n) => {
          const axis = -90 + n * 30;
          const [tx, ty] = polar(tip, axis);
          const [l1x, l1y] = polar(side, axis - spread);
          const [r1x, r1y] = polar(side, axis + spread);
          const [l2x, l2y] = polar(tip * 0.86, axis - spread * 0.55);
          const [r2x, r2y] = polar(tip * 0.86, axis + spread * 0.55);
          const sa = n === 0;
          return (
            <path
              key={n}
              d={`M60 60 C${f(l1x)} ${f(l1y)} ${f(l2x)} ${f(l2y)} ${f(tx)} ${f(ty)} C${f(r2x)} ${f(r2y)} ${f(r1x)} ${f(r1y)} 60 60 Z`}
              strokeLinejoin="round"
              style={paint(
                sa
                  ? "color-mix(in srgb, var(--sg-warm) 38%, transparent)"
                  : `color-mix(in srgb, ${ink} ${detail ? 17 : 22}%, transparent)`,
                sa ? "var(--sg-warm)" : ink,
                line,
              )}
            />
          );
        })}
        <circle
          cx="60"
          cy="60"
          r={detail ? 5 : 7}
          style={paint(bg, ink, line)}
        />
        {detail &&
          notes.map((n) => {
            const [x, y] = polar(tip, -90 + n * 30);
            return (
              <circle
                key={`dot-${n}`}
                cx={f(x)}
                cy={f(y)}
                r="2.3"
                style={paint(n === 0 ? "var(--sg-warm)" : ink)}
              />
            );
          })}
        {detail && cycle && (
          <>
            {Array.from({ length: beats - 1 }, (_, i) => {
              const [x, y] = polar(49, -90 + ((i + 1) * 360) / beats);
              return (
                <circle
                  key={`beat-${i}`}
                  cx={f(x)}
                  cy={f(y)}
                  r="1.7"
                  style={paint(`color-mix(in srgb, ${ink} 60%, transparent)`)}
                />
              );
            })}
            <circle cx="60" cy="11" r="3" style={paint(ink)} />
          </>
        )}
      </>
    );
  } else if (cycle) {
    // Percussion and unknown ragas: the tala ring alone, a mridangam head at its centre.
    art = (
      <>
        {ring(cycle.angas, 44, ink, 4)}
        <circle
          cx="60"
          cy="60"
          r="24"
          style={paint(`color-mix(in srgb, ${ink} 16%, transparent)`, ink, 2.4)}
        />
        <circle cx="60" cy="60" r="9" style={paint(ink)} />
        <circle cx="60" cy="16" r="6" style={paint("var(--sg-warm)")} />
      </>
    );
  } else {
    // Nothing to draw from yet: a tulsi sprig, the saffron bud at its tip.
    art = (
      <>
        <path
          d="M60 96 L60 40"
          strokeLinecap="round"
          style={paint("none", ink, 5)}
        />
        {(
          [
            [78, 30, 12, 36],
            [56, 23, 10, 42],
          ] as const
        ).flatMap(([y, length, width, angle]) =>
          [-180 + angle, -angle].map((rotate) => (
            <path
              key={`${y}-${rotate}`}
              d={`M0 0 C${length * 0.2} ${-width} ${length * 0.7} ${-width * 0.9} ${length} 0 C${length * 0.7} ${width * 0.9} ${length * 0.2} ${width} 0 0 Z`}
              transform={`translate(60 ${y}) rotate(${rotate})`}
              style={paint(`color-mix(in srgb, ${ink} 70%, transparent)`)}
            />
          )),
        )}
        <circle cx="60" cy="30" r="8" style={paint("var(--sg-warm)")} />
      </>
    );
  }
  return (
    <svg
      className={`raga-cover ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="120" height="120" rx={f(rx)} style={paint(bg)} />
      {art}
    </svg>
  );
}
