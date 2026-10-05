import { useEffect, useRef, useState } from "react";
import { Headphones, MessageSquare, CheckCircle2, Link2 } from "lucide-react";
import { WorkflowForm } from "../../components/WorkflowForm";
import { Badge } from "../../components/ui";
import { resourceLink } from "../../routes";
import { type Row, type SchoolTools, text, num } from "./common";

export function Review({
  tools,
  submission,
  labels,
  canPublish,
  rubric = [],
  onUpdated,
}: {
  tools: SchoolTools;
  submission: Row;
  labels: string[];
  canPublish: boolean;
  rubric?: { name: string; max: number }[];
  onUpdated?: () => void;
}) {
  const assets = submission.asset_ids as string[];
  const [asset, setAsset] = useState(assets[0]);
  const [annotations, setAnnotations] = useState<Row[]>([]);
  const [start, setStart] = useState(0),
    [end, setEnd] = useState(1);
  const [kind, setKind] = useState("point"),
    [duration, setDuration] = useState(0);
  const [publishedAt, setPublishedAt] = useState(
    text(submission, "review_published_at"),
  );
  const [scores, setScores] = useState(
    (submission.scores || {}) as Record<string, number>,
  );
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true),
    [mediaError, setMediaError] = useState(false);
  const [scoreSaved, setScoreSaved] = useState(false);
  const [scoreDirty, setScoreDirty] = useState(false);
  const [annotationDirty, setAnnotationDirty] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const request = useRef(0);
  const title = useRef<HTMLHeadingElement>(null);
  const reviewer = labels.length > 0 || canPublish;
  const canAnnotate = labels.length > 0 && !publishedAt;
  const invalidTiming =
    start < 0 ||
    !Number.isFinite(start) ||
    (duration > 0 && start >= duration) ||
    (kind === "interval" &&
      (!Number.isFinite(end) ||
        end <= start ||
        (duration > 0 && end > duration)));
  async function load() {
    const id = ++request.current;
    setLoadError("");
    try {
      const rows = await tools.read<Row[]>(
        "annotations",
        "?id=" + submission.id,
      );
      if (id === request.current) setAnnotations(rows);
    } catch (e) {
      if (id === request.current) setLoadError((e as Error).message);
    } finally {
      if (id === request.current) setLoading(false);
    }
  }
  useEffect(() => {
    setAsset(assets[0]);
    setAnnotations([]);
    setLoading(true);
    setPublishedAt(text(submission, "review_published_at"));
    setScores((submission.scores || {}) as Record<string, number>);
    setScoreSaved(false);
    setScoreDirty(false);
    setAnnotationDirty(false);
    title.current?.focus();
    void load();
    return () => {
      request.current++;
    };
  }, [submission.id, tools.read]);
  useEffect(() => {
    setPublishedAt(text(submission, "review_published_at"));
  }, [submission.review_published_at]);
  const visibleAnnotations = annotations.filter((a) => a.asset_id === asset);
  return (
    <article
      className={`review-workspace ${reviewer ? "review-workspace-staff" : "review-workspace-learner"}`}
      data-route-resource={submission.id}
    >
      <header className="review-heading">
        <div>
          <span className="eyebrow">
            {reviewer ? "Recording review" : "Your teacher’s feedback"} ·
            Version {num(submission, "version")}
          </span>
          <h2 ref={title} tabIndex={-1}>
            {text(submission, "learner_name") || "Your submission"}
          </h2>
          <p>{text(submission, "title")}</p>
        </div>
        <div className="review-heading-meta">
          <Badge tone={publishedAt ? "success" : "attention"}>
            {publishedAt ? "Published" : "Private draft"}
          </Badge>
          <a
            href={resourceLink(tools.school.id, {
              page: reviewer ? "review" : "learning",
              module: "tests",
              section: "feedback",
              test: text(submission, "assessment_id"),
              review: submission.id,
            })}
          >
            <Link2 size={13} />
            Review permalink
          </a>
        </div>
      </header>
      <div className="review-layout">
        <section
          className="review-listening"
          aria-label="Recording and feedback"
        >
          <div className="review-player">
            <span className="eyebrow">
              <Headphones size={16} />
              Listen closely
            </span>
            <label>
              Recording
              <select
                value={asset}
                disabled={annotationDirty}
                onChange={(e) => {
                  setAsset(e.target.value);
                  setDuration(0);
                  setMediaError(false);
                  setStart(0);
                  setEnd(1);
                }}
              >
                {assets.map((a, i) => (
                  <option value={a} key={a}>
                    Recording {i + 1}
                  </option>
                ))}
              </select>
            </label>
            {annotationDirty && assets.length > 1 && (
              <p role="status">
                Save or clear your listening note before changing recordings.
              </p>
            )}
            <audio
              key={asset}
              ref={audio}
              controls
              preload="metadata"
              src={`/api/schools/${tools.school.id}/media/${asset}`}
              onLoadedMetadata={() => setDuration(audio.current?.duration || 0)}
              onError={() => setMediaError(true)}
            />
            {mediaError && (
              <p role="alert">
                This recording couldn’t load. Refresh the page to try again.
              </p>
            )}
            <p>
              Feedback stays attached to this recording and submission version.
            </p>
          </div>
          <div className="annotation-heading">
            <h3>Passage feedback</h3>
            <Badge>
              {visibleAnnotations.length}{" "}
              {visibleAnnotations.length === 1 ? "note" : "notes"}
            </Badge>
          </div>
          {loading ? (
            <p role="status" className="ui-empty">
              Loading feedback…
            </p>
          ) : loadError ? (
            <div className="ui-empty" role="alert">
              <p>{loadError}</p>
              <button onClick={() => void load()}>Try again</button>
            </div>
          ) : !visibleAnnotations.length ? (
            <div className="review-empty">
              <MessageSquare size={22} />
              <h4>
                {canAnnotate
                  ? "Add your first listening note"
                  : "No passage notes for this recording"}
              </h4>
              <p>
                {canAnnotate
                  ? "Listen to a passage, capture its time and explain what to practise."
                  : "Any published scores are shown alongside the recording."}
              </p>
            </div>
          ) : (
            <ol className="annotation-list">
              {visibleAnnotations.map((a) => (
                <li key={a.id}>
                  <div className="annotation-top">
                    <button
                      className="timestamp-button"
                      onClick={() => {
                        if (audio.current) {
                          audio.current.currentTime = num(a, "start_ms") / 1000;
                          void audio.current
                            .play()
                            .catch(() => setMediaError(true));
                        }
                      }}
                    >
                      {(num(a, "start_ms") / 1000).toFixed(2)}s
                      {a.end_ms != null
                        ? "–" + (num(a, "end_ms") / 1000).toFixed(2) + "s"
                        : ""}
                    </button>
                    <Badge>{text(a, "label")}</Badge>
                  </div>
                  <p>{text(a, "comment")}</p>
                  {text(a, "exercise") && (
                    <div className="annotation-practice">
                      <strong>Try this</strong>
                      <p>{text(a, "exercise")}</p>
                    </div>
                  )}
                  <small>
                    {text(a, "reviewer")}
                    {a.verified_at ? " · Verified" : " · Draft"}
                  </small>
                </li>
              ))}
            </ol>
          )}
        </section>
        <div className="review-writing">
          {canAnnotate && (
            <section className="review-editor">
              <h3>Add a listening note</h3>
              <p>Describe one specific moment or passage.</p>
              <WorkflowForm
                className="form-grid"
                onChange={(e) => {
                  const draft = new FormData(e.currentTarget);
                  setAnnotationDirty(
                    Boolean(
                      String(draft.get("comment") || "").trim() ||
                        String(draft.get("exercise") || "").trim(),
                    ),
                  );
                }}
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (invalidTiming) return;
                  const form = e.currentTarget,
                    f = new FormData(form);
                  if (
                    await tools.command("review.annotate", {
                      submission: submission.id,
                      asset,
                      kind,
                      start: Math.round(start * 1000),
                      end:
                        kind === "interval"
                          ? Math.round(end * 1000)
                          : undefined,
                      label: f.get("label"),
                      comment: f.get("comment"),
                      exercise: f.get("exercise"),
                    })
                  ) {
                    form.reset();
                    setAnnotationDirty(false);
                    await load();
                  }
                }}
              >
                <label>
                  Kind
                  <select
                    value={kind}
                    onChange={(e) => setKind(e.target.value)}
                  >
                    <option value="point">Point</option>
                    <option value="interval">Passage</option>
                  </select>
                </label>
                <label>
                  Issue label
                  <select name="label">
                    {labels.map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Start (seconds)
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    max={duration || undefined}
                    value={start}
                    onChange={(e) => setStart(Number(e.target.value))}
                  />
                </label>
                <button
                  type="button"
                  className="text-button timing-action"
                  onClick={() => setStart(audio.current?.currentTime || 0)}
                >
                  Use playback position
                </button>
                {kind === "interval" && (
                  <>
                    <label>
                      End (seconds)
                      <input
                        type="number"
                        required
                        min="0"
                        step="0.01"
                        max={duration || undefined}
                        value={end}
                        onChange={(e) => setEnd(Number(e.target.value))}
                      />
                    </label>
                    <button
                      type="button"
                      className="text-button timing-action"
                      onClick={() => setEnd(audio.current?.currentTime || 0)}
                    >
                      End at playback position
                    </button>
                  </>
                )}
                {invalidTiming && (
                  <p className="wide alert" role="alert">
                    Choose a time inside the recording. A passage must end after
                    it starts.
                  </p>
                )}
                <label className="wide">
                  Feedback
                  <textarea
                    name="comment"
                    required
                    placeholder="What should the learner listen for?"
                    rows={3}
                  />
                </label>
                <label className="wide">
                  Suggested exercise
                  <textarea
                    name="exercise"
                    placeholder="A small, specific next step"
                    rows={2}
                  />
                </label>
                <button
                  className="button primary wide"
                  disabled={tools.busy || invalidTiming}
                >
                  Add draft feedback
                </button>
                {annotationDirty && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={(e) => {
                      e.currentTarget.form?.reset();
                      setAnnotationDirty(false);
                    }}
                  >
                    Clear unsaved note
                  </button>
                )}
              </WorkflowForm>
            </section>
          )}
          {(rubric.length > 0 || Object.keys(scores).length > 0) && (
            <section className="review-score-panel">
              <h3>{publishedAt ? "Assessment scores" : "Rubric scores"}</h3>
              {publishedAt ? (
                <dl className="review-scores" aria-label="Assessment scores">
                  {Object.entries(scores).map(([name, score]) => (
                    <div key={name}>
                      <dt>{name}</dt>
                      <dd>
                        {score}
                        {rubric.find((r) => r.name === name) && (
                          <small>
                            {" "}
                            / {rubric.find((r) => r.name === name)?.max}
                          </small>
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <WorkflowForm
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    const next = Object.fromEntries(
                      rubric.map((r) => [r.name, Number(f.get(r.name))]),
                    );
                    if (
                      await tools.command("review.score", {
                        id: submission.id,
                        scores: next,
                      })
                    ) {
                      setScores(next);
                      setScoreSaved(true);
                      setScoreDirty(false);
                    }
                  }}
                >
                  {rubric.map((r) => (
                    <label className="rubric-row" key={r.name}>
                      <span>
                        {r.name} / {r.max}
                      </span>
                      <input
                        type="number"
                        required
                        name={r.name}
                        min="0"
                        max={r.max}
                        step="0.5"
                        defaultValue={Number(scores[r.name] || 0)}
                        onChange={() => {
                          setScoreSaved(false);
                          setScoreDirty(true);
                        }}
                      />
                    </label>
                  ))}
                  <button className="button secondary" disabled={tools.busy}>
                    Save draft scores
                  </button>
                  {scoreSaved && (
                    <p className="inline-success" role="status">
                      <CheckCircle2 size={15} />
                      Draft scores saved
                    </p>
                  )}
                </WorkflowForm>
              )}
            </section>
          )}
          <section
            className={`review-publication ${publishedAt ? "is-published" : ""}`}
          >
            <h3>
              {publishedAt
                ? "Feedback is published"
                : canPublish
                  ? "Ready to share?"
                  : "Awaiting publication"}
            </h3>
            <p>
              {publishedAt
                ? "The learner and their authorised guardian can read these scores and listening notes."
                : "Draft feedback is private until the owner publishes it."}
            </p>
            {canPublish && !publishedAt && (scoreDirty || annotationDirty) && (
              <p role="status">
                Save your draft scores or listening note before publishing. You
                can also clear an unsaved note.
              </p>
            )}
            {canPublish && !publishedAt && (
              <button
                className="button primary"
                disabled={
                  tools.busy ||
                  loading ||
                  !!loadError ||
                  scoreDirty ||
                  annotationDirty
                }
                onClick={async () => {
                  if (
                    await tools.command("review.moderate", {
                      id: submission.id,
                      publish: true,
                    })
                  ) {
                    setPublishedAt(new Date().toISOString());
                    await load();
                    onUpdated?.();
                  }
                }}
              >
                Verify and publish feedback
              </button>
            )}
          </section>
        </div>
      </div>
    </article>
  );
}
