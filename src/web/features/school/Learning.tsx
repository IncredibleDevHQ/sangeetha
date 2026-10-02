import { UploadCloud } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { type Row, type SchoolTools, text, num, Select } from "./common";
type Library = { lessons: Row[]; assets: Row[]; progress: Row[] };
export function Upload({
  tools,
  lesson,
  learner,
  onReady,
}: {
  tools: SchoolTools;
  lesson?: string;
  learner?: string;
  onReady: (id: string) => void;
}) {
  const [progress, setProgress] = useState(""),
    [busy, setBusy] = useState(false);
  async function upload(file: File) {
    setBusy(true);
    const key = `upload:${tools.school.id}:${lesson || learner}:${file.name}:${file.size}:${file.lastModified}`;
    try {
      let id = localStorage.getItem(key);
      if (!id) {
        const reserved = await tools.command<{ id: string }>("media.reserve", {
          filename: file.name,
          mime:
            (
              {
                "audio/x-wav": "audio/wav",
                "audio/x-m4a": "audio/mp4",
              } as Record<string, string>
            )[file.type] ||
            file.type ||
            (
              {
                wav: "audio/wav",
                mp3: "audio/mpeg",
                m4a: "audio/mp4",
                webm: "audio/webm",
                ogg: "audio/ogg",
                flac: "audio/flac",
                mp4: "video/mp4",
                pdf: "application/pdf",
                png: "image/png",
                jpg: "image/jpeg",
                jpeg: "image/jpeg",
                txt: "text/plain",
              } as Record<string, string>
            )[file.name.split(".").pop()?.toLowerCase() || ""] ||
            "audio/wav",
          bytes: file.size,
          lesson,
          learner,
        });
        if (!reserved) return;
        id = reserved.id;
        localStorage.setItem(key, id);
      }
      const status = await tools.read<{ asset: Row; parts: number[] }>(
        "upload-status",
        "?id=" + id,
      );
      if (text(status.asset, "status") !== "ready") {
        const size = 262144,
          total = Math.ceil(file.size / size);
        for (let part = 0; part < total; part++) {
          setProgress(`Uploading ${part + 1} of ${total} parts…`);
          if (status.parts.includes(part)) continue;
          const bytes = new Uint8Array(
            await file.slice(part * size, (part + 1) * size).arrayBuffer(),
          );
          let binary = "";
          for (const byte of bytes) binary += String.fromCharCode(byte);
          const result = await tools.command("media.chunk", {
            id,
            part,
            data: btoa(binary),
          });
          if (!result) {
            setProgress(
              "Upload paused. Select the same file to resume; see the error above.",
            );
            return;
          }
        }
        if (!(await tools.command("media.finalize", { id }))) {
          setProgress("Finalization failed. See the error above.");
          return;
        }
      }
      localStorage.removeItem(key);
      onReady(id);
      setProgress("Material ready.");
    } catch (e) {
      tools.setError((e as Error).message);
      setProgress("Select the same file to resume missing parts.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <label className="upload-zone">
      <UploadCloud size={24} aria-hidden="true" />
      <strong>
        {lesson ? "Upload lesson material" : "Choose an audio recording"}
      </strong>
      <input
        type="file"
        accept={
          lesson
            ? "audio/*,video/mp4,video/webm,application/pdf,image/png,image/jpeg,text/plain"
            : "audio/*"
        }
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            e.currentTarget.value = "";
            void upload(f);
          }
        }}
      />
      <small role="status">
        {progress ||
          (lesson
            ? "Audio, MP4/WebM video, PDF, PNG/JPEG or text notes. Up to 50 MB per file; uploads can resume."
            : "Private audio, up to 50 MB. Interrupted uploads can resume.")}
      </small>
    </label>
  );
}
export function Audio({ tools, asset }: { tools: SchoolTools; asset: string }) {
  return (
    <audio
      controls
      preload="metadata"
      src={`/api/schools/${tools.school.id}/media/${asset}`}
    />
  );
}
export function LessonMaterial({
  tools,
  asset,
}: {
  tools: SchoolTools;
  asset: Row;
}) {
  const src = `/api/schools/${tools.school.id}/media/${asset.id}`;
  const mime = text(asset, "mime");
  return (
    <div className="lesson-material">
      <p>{text(asset, "filename")}</p>
      {mime.startsWith("audio/") ? (
        <Audio tools={tools} asset={asset.id} />
      ) : mime.startsWith("video/") ? (
        <video controls playsInline preload="metadata" src={src} />
      ) : mime.startsWith("image/") ? (
        <a href={src} target="_blank" rel="noreferrer">
          <img src={src} alt={text(asset, "filename")} loading="lazy" />
        </a>
      ) : (
        <a href={src} target="_blank" rel="noreferrer">
          Open {mime === "application/pdf" ? "PDF music notes" : "text notes"}
        </a>
      )}
    </div>
  );
}
export function LibraryView({
  tools,
  manage,
  batches = [],
  learners = [],
  portalLearners = [],
}: {
  tools: SchoolTools;
  manage: boolean;
  batches?: Row[];
  learners?: Row[];
  portalLearners?: Row[];
}) {
  const [data, setData] = useState<Library>({
    lessons: [],
    assets: [],
    progress: [],
  });
  const [roster, setRoster] = useState({ batches, learners });
  const [curriculum, setCurriculum] = useState("");
  const [selected, setSelected] = useState("");
  const reader = useRef<HTMLElement>(null);
  const [batch, setBatch] = useState("");
  const [practiceLesson, setPracticeLesson] = useState("");
  const [learner, setLearner] = useState("");
  const [viewLearner, setViewLearner] = useState("");
  const load = () =>
    tools
      .read<Library>("library")
      .then(setData)
      .catch((e) => tools.setError(e.message));
  useEffect(() => {
    void load();
    if (manage)
      tools
        .read<typeof roster>("roster")
        .then(setRoster)
        .catch((e) => tools.setError(e.message));
  }, [tools.read]);
  const canWrite = manage || batches.length > 0;
  const activeLearner = viewLearner || portalLearners[0]?.id || "";
  const visibleLessons =
    !canWrite && activeLearner
      ? data.lessons.filter((l) =>
          (l.eligible_learners as string[]).includes(activeLearner),
        )
      : data.lessons;
  const curricula = [
    ...new Set(visibleLessons.map((l) => text(l, "curriculum"))),
  ];
  const activeCurriculum = curricula.includes(curriculum)
    ? curriculum
    : curricula[0] || "";
  const lessons = visibleLessons.filter(
    (l) => l.curriculum === activeCurriculum,
  );
  const current = lessons.find((l) => l.id === selected) || lessons[0];
  const index = current ? lessons.indexOf(current) : 0;
  useEffect(() => {
    if (selected) reader.current?.scrollIntoView({ block: "start" });
  }, [current?.id]);
  const completed = (id: string) =>
    data.progress.some(
      (p) => p.lesson_id === id && p.learner_id === activeLearner,
    );
  const editable =
    current && (manage || batches.some((b) => b.id === current.batch_id));
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form);
    const result = await tools.command<{ id: string }>("lesson.create", {
      title: f.get("title"),
      curriculum: f.get("curriculum"),
      position: Number(f.get("position")),
      level: f.get("level"),
      module: f.get("module"),
      raga: f.get("raga"),
      tala: f.get("tala"),
      instructions: f.get("instructions"),
      musicNotes: f.get("musicNotes"),
      batch: batch || undefined,
      published: false,
    });
    if (result) {
      setCurriculum(String(f.get("curriculum")));
      setSelected(result.id);
      form.reset();
      await load();
    }
  }
  return (
    <>
      <h2>Curriculum and lessons</h2>
      <p>
        Learn in order, listen and watch, then practise with the music notes.
      </p>
      {canWrite && (
        <details className="record-card">
          <summary>Add a lesson or start a curriculum</summary>
          <form className="form-grid" onSubmit={create}>
            <label>
              Curriculum name
              <input
                name="curriculum"
                required
                defaultValue={activeCurriculum || "Carnatic Junior"}
              />
            </label>
            <label>
              Lesson number
              <input
                type="number"
                name="position"
                min="1"
                max="10000"
                required
                defaultValue={lessons.length + 1}
              />
            </label>
            <label>
              Title
              <input name="title" required />
            </label>
            <label>
              Level
              <input name="level" required defaultValue="Beginner" />
            </label>
            <label>
              Module
              <input name="module" required defaultValue="Foundations" />
            </label>
            <label>
              Raga
              <input name="raga" />
            </label>
            <label>
              Tala
              <input name="tala" />
            </label>
            <Select
              label="Batch"
              optional={manage}
              rows={manage ? roster.batches : batches}
              value={batch}
              onChange={setBatch}
            />
            <label className="wide">
              Lesson instructions
              <textarea name="instructions" />
            </label>
            <label className="wide">
              Music notes
              <textarea
                className="music-notes-input"
                name="musicNotes"
                placeholder="S R G M | P D N Ṡ"
                rows={5}
              />
            </label>
            <button>Create draft lesson</button>
          </form>
        </details>
      )}
      {portalLearners.length > 1 && (
        <Select
          label="Learning as"
          rows={portalLearners}
          value={activeLearner}
          onChange={(id) => {
            setViewLearner(id);
            setSelected("");
          }}
        />
      )}
      {curricula.length > 0 && (
        <label>
          Curriculum
          <select
            value={activeCurriculum}
            onChange={(e) => {
              setCurriculum(e.target.value);
              setSelected("");
            }}
          >
            {curricula.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
      )}
      {!current && (
        <p>
          No lessons are available yet. Published lessons appear here for their
          assigned batch or level.
        </p>
      )}
      {current && (
        <div className="curriculum-layout">
          <nav className="curriculum-outline" aria-label="Lesson sequence">
            <h3>{activeCurriculum}</h3>
            <p>
              {lessons.length} lessons
              {activeLearner
                ? ` · ${lessons.filter((l) => completed(l.id)).length} completed`
                : ""}
            </p>
            {lessons.map((l, i) => (
              <button
                key={l.id}
                aria-current={current.id === l.id ? "step" : undefined}
                onClick={() => setSelected(l.id)}
              >
                <span>
                  {i + 1}. {text(l, "title")}
                </span>
                <small>
                  {completed(l.id)
                    ? "Completed"
                    : l.published
                      ? text(l, "module")
                      : "Draft"}
                </small>
              </button>
            ))}
          </nav>
          <article
            className="record-card lesson-reader"
            key={current.id}
            ref={reader}
          >
            <small>
              Lesson {index + 1} of {lessons.length} · {text(current, "level")}
            </small>
            <h3>{text(current, "title")}</h3>
            <p>
              {[
                text(current, "module"),
                text(current, "raga"),
                text(current, "tala"),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p className="lesson-instructions">
              {text(current, "instructions")}
            </p>
            {text(current, "music_notes") && (
              <section>
                <h4>Music notes</h4>
                <pre className="music-notes">
                  {text(current, "music_notes")}
                </pre>
              </section>
            )}
            {data.assets
              .filter((a) => a.lesson_id === current.id)
              .map((a) => (
                <LessonMaterial key={a.id} tools={tools} asset={a} />
              ))}
            {editable && (
              <>
                <p>
                  {current.published
                    ? "Published to eligible learners"
                    : "Draft — visible to teachers only"}
                </p>
                <Upload
                  tools={tools}
                  lesson={current.id}
                  onReady={() => void load()}
                />
                <details>
                  <summary>Edit lesson and music notes</summary>
                  <form
                    className="form-grid"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      if (
                        await tools.command("lesson.update", {
                          id: current.id,
                          title: f.get("title"),
                          curriculum: f.get("curriculum"),
                          position: Number(f.get("position")),
                          instructions: f.get("instructions"),
                          musicNotes: f.get("musicNotes"),
                        })
                      )
                        await load();
                    }}
                  >
                    <label>
                      Title
                      <input
                        name="title"
                        required
                        defaultValue={text(current, "title")}
                      />
                    </label>
                    <label>
                      Curriculum name
                      <input
                        name="curriculum"
                        required
                        defaultValue={text(current, "curriculum")}
                      />
                    </label>
                    <label>
                      Lesson number
                      <input
                        name="position"
                        type="number"
                        min="1"
                        max="10000"
                        required
                        defaultValue={num(current, "position")}
                      />
                    </label>
                    <label className="wide">
                      Lesson instructions
                      <textarea
                        name="instructions"
                        defaultValue={text(current, "instructions")}
                      />
                    </label>
                    <label className="wide">
                      Music notes
                      <textarea
                        name="musicNotes"
                        rows={6}
                        className="music-notes-input"
                        defaultValue={text(current, "music_notes")}
                      />
                    </label>
                    <button>Save lesson</button>
                  </form>
                </details>
                <button
                  onClick={async () => {
                    if (
                      await tools.command("lesson.publish", {
                        id: current.id,
                        published: !current.published,
                      })
                    )
                      await load();
                  }}
                >
                  {current.published ? "Unpublish" : "Publish"} lesson
                </button>
              </>
            )}
            {activeLearner &&
              (current.eligible_learners as string[]).includes(
                activeLearner,
              ) && (
                <button
                  onClick={async () => {
                    if (
                      await tools.command("lesson.complete", {
                        lesson: current.id,
                        learner: activeLearner,
                        completed: !completed(current.id),
                      })
                    )
                      await load();
                  }}
                >
                  {completed(current.id)
                    ? "Mark as still practising"
                    : "Mark lesson complete"}
                </button>
              )}
            <div className="lesson-navigation">
              <button
                disabled={index === 0}
                onClick={() => setSelected(lessons[index - 1].id)}
              >
                Previous lesson
              </button>
              <button
                disabled={index === lessons.length - 1}
                onClick={() => setSelected(lessons[index + 1].id)}
              >
                Next lesson
              </button>
            </div>
          </article>
        </div>
      )}
      {canWrite && (
        <details className="record-card">
          <summary>Assign practice</summary>
          <form
            className="form-grid"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              await tools.command("practice.create", {
                lesson: practiceLesson,
                learner,
                text: f.get("text"),
                due: f.get("due"),
              });
            }}
          >
            <Select
              label="Lesson"
              value={practiceLesson}
              onChange={setPracticeLesson}
              rows={data.lessons}
              labelKey="title"
            />
            <Select
              label="Learner"
              value={learner}
              onChange={setLearner}
              rows={manage ? roster.learners : learners}
            />
            <label>
              Due
              <input type="date" name="due" required />
            </label>
            <label>
              Exercise
              <textarea name="text" required />
            </label>
            <button>Assign practice</button>
          </form>
        </details>
      )}
    </>
  );
}
export function Review({
  tools,
  submission,
  labels,
  canPublish,
  rubric = [],
}: {
  tools: SchoolTools;
  submission: Row;
  labels: string[];
  canPublish: boolean;
  rubric?: { name: string; max: number }[];
}) {
  const assets = submission.asset_ids as string[],
    [asset, setAsset] = useState(assets[0]),
    [annotations, setAnnotations] = useState<Row[]>([]),
    [start, setStart] = useState(0),
    [end, setEnd] = useState(1),
    [kind, setKind] = useState("point");
  const audio = useRef<HTMLAudioElement>(null);
  const load = () =>
    tools
      .read<Row[]>("annotations", "?id=" + submission.id)
      .then(setAnnotations)
      .catch((e) => tools.setError(e.message));
  useEffect(() => {
    void load();
  }, [submission.id]);
  return (
    <article className="record-card">
      <h3>
        {text(submission, "learner_name") || "Your submission"} ·{" "}
        {text(submission, "title")} · version {num(submission, "version")}
      </h3>
      <label>
        Recording
        <select value={asset} onChange={(e) => setAsset(e.target.value)}>
          {assets.map((a, i) => (
            <option value={a} key={a}>
              Recording {i + 1}
            </option>
          ))}
        </select>
      </label>
      <audio
        ref={audio}
        controls
        preload="metadata"
        src={`/api/schools/${tools.school.id}/media/${asset}`}
      />
      {annotations
        .filter((a) => a.asset_id === asset)
        .map((a) => (
          <p key={a.id}>
            <button
              onClick={() => {
                if (audio.current) {
                  audio.current.currentTime = num(a, "start_ms") / 1000;
                  void audio.current.play();
                }
              }}
            >
              {(num(a, "start_ms") / 1000).toFixed(2)}s
              {a.end_ms != null
                ? "–" + (num(a, "end_ms") / 1000).toFixed(2) + "s"
                : ""}
            </button>{" "}
            <strong>{text(a, "label")}</strong> {text(a, "comment")}{" "}
            {text(a, "exercise")} · {text(a, "reviewer")}{" "}
            {a.verified_at ? "(verified)" : ""}
          </p>
        ))}
      {labels.length > 0 && !submission.review_published_at && (
        <form
          className="form-grid"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            if (
              await tools.command("review.annotate", {
                submission: submission.id,
                asset,
                kind,
                start: Math.round(start * 1000),
                end: kind === "interval" ? Math.round(end * 1000) : undefined,
                label: f.get("label"),
                comment: f.get("comment"),
                exercise: f.get("exercise"),
              })
            )
              void load();
          }}
        >
          <label>
            Kind
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="point">Point</option>
              <option value="interval">Passage</option>
            </select>
          </label>
          <label>
            Start (seconds)
            <input
              type="number"
              min="0"
              step="0.01"
              value={start}
              onChange={(e) => setStart(Number(e.target.value))}
            />
          </label>
          <button
            type="button"
            onClick={() => setStart(audio.current?.currentTime || 0)}
          >
            Use playback position
          </button>
          {kind === "interval" && (
            <label>
              End (seconds)
              <input
                type="number"
                min="0"
                step="0.01"
                value={end}
                onChange={(e) => setEnd(Number(e.target.value))}
              />
            </label>
          )}
          <label>
            Issue label
            <select name="label">
              {labels.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
          <label>
            Feedback
            <textarea name="comment" required />
          </label>
          <label>
            Suggested exercise
            <textarea name="exercise" />
          </label>
          <button>Add draft feedback</button>
        </form>
      )}
      {!!submission.review_published_at && (
        <dl className="review-scores" aria-label="Assessment scores">
          {Object.entries(
            (submission.scores || {}) as Record<string, number>,
          ).map(([name, score]) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd>{score}</dd>
            </div>
          ))}
        </dl>
      )}
      {rubric.length > 0 && !submission.review_published_at && (
        <form
          className="form-grid"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            await tools.command("review.score", {
              id: submission.id,
              scores: Object.fromEntries(
                rubric.map((r) => [r.name, Number(f.get(r.name))]),
              ),
            });
          }}
        >
          {rubric.map((r) => (
            <label key={r.name}>
              {r.name} / {r.max}
              <input
                type="number"
                name={r.name}
                min="0"
                max={r.max}
                step="0.5"
                defaultValue={Number(
                  (submission.scores as Record<string, number>)?.[r.name] || 0,
                )}
              />
            </label>
          ))}
          <button>Save draft scores</button>
        </form>
      )}
      {canPublish && !submission.review_published_at && (
        <button
          onClick={async () => {
            if (
              await tools.command("review.moderate", {
                id: submission.id,
                publish: true,
              })
            ) {
              submission.review_published_at = new Date().toISOString();
              void load();
            }
          }}
        >
          Verify and publish feedback
        </button>
      )}
      <p>
        {submission.review_published_at
          ? "Feedback published"
          : "Draft feedback is private until the owner publishes it."}
      </p>
    </article>
  );
}
export function TestsView({
  tools,
  manage,
  canPublish,
  canExport,
}: {
  tools: SchoolTools;
  manage: boolean;
  canPublish: boolean;
  canExport: boolean;
}) {
  const [data, setData] = useState<{
      tests: Row[];
      submissions: Row[];
      taxonomies: Row[];
    }>({ tests: [], submissions: [], taxonomies: [] }),
    [learners, setLearners] = useState<Row[]>([]),
    [selected, setSelected] = useState<string[]>([]);
  const load = () =>
    tools
      .read<typeof data>("tests")
      .then(setData)
      .catch((e) => tools.setError(e.message));
  useEffect(() => {
    void load();
    if (manage)
      tools
        .read<{ learners: Row[] }>("roster")
        .then((r) => setLearners(r.learners))
        .catch((e) => tools.setError(e.message));
  }, [tools.read]);
  return (
    <>
      <h2>Tests and review queue</h2>
      {manage && (
        <>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (
                await tools.command("taxonomy.create", {
                  labels: String(f.get("labels"))
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              )
                void load();
            }}
          >
            <label>
              Issue vocabulary, separated by commas
              <input
                name="labels"
                required
                defaultValue="Shruti, Rhythm, Pronunciation, Breath, Gamaka"
              />
            </label>
            <button>Create vocabulary version</button>
          </form>
          <details>
            <summary>Create test</summary>
            <form
              className="form-grid"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                if (
                  await tools.command("test.create", {
                    title: f.get("title"),
                    instructions: f.get("instructions"),
                    due: new Date(
                      String(f.get("due")) + "+05:30",
                    ).toISOString(),
                    taxonomy: Number(f.get("taxonomy")),
                    learners: selected,
                    rubric: String(f.get("rubric"))
                      .split(",")
                      .map((s) => ({ name: s.trim(), max: 10 })),
                    published: true,
                  })
                )
                  void load();
              }}
            >
              <label>
                Title
                <input name="title" required />
              </label>
              <label>
                Due (IST)
                <input type="datetime-local" name="due" required />
              </label>
              <label>
                Vocabulary
                <select name="taxonomy" required>
                  {data.taxonomies.map((t) => (
                    <option key={num(t, "version")} value={num(t, "version")}>
                      Version {num(t, "version")}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Rubric criteria, each out of 10
                <input
                  name="rubric"
                  required
                  defaultValue="Pitch,Rhythm,Expression"
                />
              </label>
              <label className="wide">
                Instructions
                <textarea name="instructions" required />
              </label>
              <div className="wide member-picker">
                {learners.map((l) => (
                  <label key={l.id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(l.id)}
                      onChange={(e) =>
                        setSelected((s) =>
                          e.target.checked
                            ? [...s, l.id]
                            : s.filter((i) => i !== l.id),
                        )
                      }
                    />
                    {text(l, "name")}
                  </label>
                ))}
              </div>
              <button>Create and publish test</button>
            </form>
          </details>
        </>
      )}
      {data.tests.map((t) => (
        <article key={t.id}>
          <strong>{text(t, "title")}</strong> · due{" "}
          {new Date(text(t, "due_at")).toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
          })}{" "}
          IST · {text(t, "instructions")}
          {manage && (
            <form
              className="form-grid"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                await tools.command("test.update", {
                  id: t.id,
                  due: new Date(String(f.get("due")) + "+05:30").toISOString(),
                  published: f.get("published") === "on",
                });
                void load();
              }}
            >
              <label>
                Extend deadline (IST)
                <input
                  type="datetime-local"
                  name="due"
                  required
                  defaultValue={new Date(text(t, "due_at"))
                    .toLocaleString("sv-SE", { timeZone: "Asia/Kolkata" })
                    .replace(" ", "T")
                    .slice(0, 16)}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  name="published"
                  defaultChecked={!!t.published}
                />{" "}
                Published
              </label>
              <button>Update availability</button>
            </form>
          )}
        </article>
      ))}
      {data.submissions.map((s) => (
        <Review
          key={s.id}
          tools={tools}
          submission={s}
          labels={
            (data.taxonomies.find(
              (t) =>
                t.version ===
                data.tests.find((t) => t.id === s.assessment_id)
                  ?.taxonomy_version,
            )?.labels || []) as string[]
          }
          canPublish={canPublish}
          rubric={
            (data.tests.find((t) => t.id === s.assessment_id)?.rubric ||
              []) as { name: string; max: number }[]
          }
        />
      ))}
      {canExport && (
        <button
          onClick={async () => {
            try {
              tools.download(
                "verified-labels.json",
                JSON.stringify(await tools.read("dataset"), null, 2),
                "application/json",
              );
            } catch (e) {
              tools.setError((e as Error).message);
            }
          }}
        >
          Export consented, verified labels
        </button>
      )}
    </>
  );
}
