export { TestsView } from "./TestsView";
export { Review } from "./Review";
import { WorkflowForm } from "../../components/WorkflowForm";
import {
  WorkflowDetails,
  WorkflowPanel,
  openWorkflow,
} from "../../components/WorkflowDetails";
import { useRouteValue, navigate, resourceLink } from "../../routes";
import { MusicPlayer } from "../../components/MusicPlayer";
import { UploadCloud, Plus, Users } from "lucide-react";
import { Badge, BackLink, CopyLink } from "../../components/ui";
import { PageActions } from "../../components/PageHeader";
import { EmptyArt } from "../../components/Art";
import { RagaCover } from "../../components/RagaCover";
import { LessonFields } from "./LessonFields";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { type Row, type SchoolTools, text, num, Select } from "./common";
type Library = {
  lessons: Row[];
  assets: Row[];
  progress: Row[];
  batches?: Row[];
};
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
/** What a piece of lesson material is, in a learner's words. */
export function materialTitle(mime: string) {
  if (mime.startsWith("audio/")) return "Listen and practise";
  if (mime.startsWith("video/")) return "Watch";
  if (mime.startsWith("image/")) return "Notation";
  if (mime === "application/pdf") return "Notation to print";
  return "Notes";
}
export function LessonMaterial({
  tools,
  asset,
  lesson,
  editable,
  staff = false,
  onSaved,
}: {
  tools: SchoolTools;
  asset: Row;
  lesson: Row;
  editable: boolean;
  staff?: boolean;
  onSaved: () => void;
}) {
  const src = `/api/schools/${tools.school.id}/media/${asset.id}`;
  const mime = text(asset, "mime");
  return (
    <div className="lesson-material">
      <div className="toolbar">
        <p>
          <strong>{materialTitle(mime)}</strong>
          {staff && <small> · {text(asset, "filename")}</small>}
        </p>
        {staff && (
          <CopyLink
            href={resourceLink(tools.school.id, {
              page: "lesson",
              lesson: lesson.id,
              asset: asset.id,
            })}
          />
        )}
      </div>
      {mime.startsWith("audio/") ? (
        <MusicPlayer
          tools={tools}
          asset={asset}
          lesson={lesson}
          editable={!!editable}
          onSaved={onSaved}
        />
      ) : mime.startsWith("video/") ? (
        <video controls playsInline preload="metadata" src={src} />
      ) : mime.startsWith("image/") ? (
        <a href={src} target="_blank" rel="noreferrer">
          <img src={src} alt={text(asset, "filename")} loading="lazy" />
        </a>
      ) : (
        <a href={src} target="_blank" rel="noreferrer">
          {mime === "application/pdf" ? "Open the notation" : "Open the notes"}
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
  const [curriculum, setCurriculum] = useRouteValue("curriculum");
  const [selected] = useRouteValue("lesson");
  const setSelected = (lesson: string) =>
    navigate({ lesson, asset: "", action: "", form: "", mode: "" });
  const [assetId, setAssetId] = useRouteValue("asset");
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [action] = useRouteValue("action");
  const [formId] = useRouteValue("form");
  const [mode] = useRouteValue("mode", "preview");
  const creating =
    action === "add-a-lesson-or-start-a-curriculum" ||
    formId === "create-draft-lesson";
  const authorMode =
    action === "edit-lesson-and-music-notes" || formId === "save-lesson"
      ? "edit"
      : action === "align-notes-to-this-recording"
        ? "materials"
        : ["preview", "materials", "edit"].includes(mode)
          ? mode
          : "preview";
  const request = useRef(0);
  const [category, setCategory] = useRouteValue("category");
  const [block, setBlock] = useRouteValue("block");
  const reader = useRef<HTMLElement>(null);
  const composerHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (creating) composerHeading.current?.focus();
  }, [creating]);
  const [batch, setBatch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [practiceLesson, setPracticeLesson] = useState("");
  const [learner, setLearner] = useState("");
  const [viewLearner, setViewLearner] = useRouteValue("learner");
  async function load() {
    const id = ++request.current;
    setLoadError("");
    try {
      const result = await tools.read<Library>("library");
      if (id === request.current) setData(result);
    } catch (e) {
      if (id === request.current) setLoadError((e as Error).message);
    } finally {
      if (id === request.current) setReady(true);
    }
  }
  useEffect(() => {
    let active = true;
    void load();
    if (manage)
      tools
        .read<{ capabilities: string[] }>("bootstrap")
        .then(async (access) => {
          if (access.capabilities.includes("crm.manage")) {
            const result = await tools.read<typeof roster>("roster");
            if (active) setRoster(result);
          }
        })
        .catch((e) => tools.setError(e.message));
    return () => {
      active = false;
      request.current++;
    };
  }, [tools.read, manage]);
  const canWrite = manage || batches.length > 0 || !!data.batches?.length;
  const linkedEligible = (data.lessons.find((l) => l.id === selected)
    ?.eligible_learners || []) as string[];
  const activeLearner =
    viewLearner ||
    portalLearners.find((l) => linkedEligible.includes(l.id))?.id ||
    portalLearners[0]?.id ||
    "";
  const visibleLessons =
    !canWrite && activeLearner
      ? data.lessons.filter((l) =>
          (l.eligible_learners as string[]).includes(activeLearner),
        )
      : data.lessons;
  const curricula = [
    ...new Set(visibleLessons.map((l) => text(l, "curriculum"))),
  ];
  const linkedLesson = visibleLessons.find((l) => l.id === selected);
  const activeCurriculum = linkedLesson
    ? text(linkedLesson, "curriculum")
    : curricula.includes(curriculum)
      ? curriculum
      : curricula[0] || "";
  const lessons = visibleLessons.filter(
    (l) =>
      l.curriculum === activeCurriculum &&
      (!category || !!linkedLesson || l.category === category) &&
      (!block || !!linkedLesson || l.module === block),
  );
  useEffect(() => {
    if (ready && activeCurriculum && !curriculum)
      navigate({ curriculum: activeCurriculum }, true);
  }, [ready, activeCurriculum, curriculum]);
  const current = selected
    ? lessons.find((l) => l.id === selected)
    : lessons[0];
  const index = current ? lessons.indexOf(current) : 0;
  useEffect(() => {
    if (selected) reader.current?.scrollIntoView({ block: "start" });
  }, [current?.id]);
  const scoredRecording = (lesson: string) =>
    data.assets.some(
      (a) =>
        a.lesson_id === lesson &&
        text(a, "mime").startsWith("audio/") &&
        Array.isArray(a.note_cues) &&
        a.note_cues.length > 0,
    );
  const completed = (id: string) =>
    data.progress.some(
      (p) => p.lesson_id === id && p.learner_id === activeLearner,
    );
  const editable =
    current &&
    (manage ||
      !!current.can_edit ||
      batches.some((b) => b.id === current.batch_id));
  const suggestions = {
    curricula,
    categories: [
      ...new Set(
        visibleLessons
          .filter((l) => l.curriculum === activeCurriculum)
          .map((l) => text(l, "category")),
      ),
    ],
    blocks: [
      ...new Set(
        visibleLessons
          .filter(
            (l) =>
              l.curriculum === activeCurriculum &&
              (!category || l.category === category),
          )
          .map((l) => text(l, "module")),
      ),
    ],
  };
  const audienceName = current?.batch_id
    ? text(
        (data.batches || batches).find((b) => b.id === current.batch_id) || {},
        "name",
      ) || "Assigned batch"
    : `${current ? text(current, "level") : ""} level`;
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
      category: f.get("category"),
      categoryPosition: Number(f.get("categoryPosition")),
      blockPosition: Number(f.get("blockPosition")),
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
      {canWrite && !creating && (
        <PageActions>
          <button
            className="button primary"
            onClick={() =>
              navigate({
                action: "add-a-lesson-or-start-a-curriculum",
                form: "",
                mode: "",
              })
            }
          >
            <Plus size={16} aria-hidden="true" />
            Add lesson
          </button>
        </PageActions>
      )}
      {canWrite && creating && (
        <div className="library-heading">
          <div>
            <h2 ref={composerHeading} tabIndex={-1}>
              Create a lesson
            </h2>
            <p>
              Start with a draft. Add material and publish when you’re ready.
            </p>
          </div>
        </div>
      )}
      {canWrite && creating && (
        <section className="lesson-composer">
          <BackLink onClick={() => navigate({ action: "", form: "" })}>
            Back to curriculum
          </BackLink>
          <WorkflowForm className="form-grid" onSubmit={create}>
            <LessonFields
              creating
              initial={{
                curriculum: activeCurriculum || "Carnatic Junior",
                category: category || "Foundations",
                module: block || "Foundations",
                position:
                  Math.max(0, ...lessons.map((l) => num(l, "position"))) + 1,
              }}
              suggestions={suggestions}
              audience={
                <Select
                  label="Batch"
                  optional={manage}
                  rows={data.batches || batches}
                  value={batch}
                  onChange={setBatch}
                />
              }
            />
            <div className="composer-footer wide">
              <p>
                A draft is visible to authorised teaching staff. Learners see it
                after publication.
              </p>
              <button className="button primary" disabled={tools.busy}>
                Create draft lesson
              </button>
            </div>
          </WorkflowForm>
        </section>
      )}
      <div hidden={canWrite && creating}>
        {!ready && (
          <p role="status" className="ui-empty">
            Loading curriculum…
          </p>
        )}
        {loadError && (
          <div className="ui-empty" role="alert">
            <h3>We couldn’t load your curriculum</h3>
            <p>{loadError}</p>
            <button onClick={() => void load()}>Try again</button>
          </div>
        )}
        {curricula.length > 0 && (
          <button
            type="button"
            className="button secondary filters-toggle"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            {filtersOpen ? "Hide filters" : "Filter lessons"}
          </button>
        )}
        <div className="curriculum-filters" data-open={filtersOpen}>
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
                  navigate({
                    curriculum: e.target.value,
                    mode: "",
                    category: "",
                    block: "",
                    lesson: "",
                    asset: "",
                    action: "",
                    form: "",
                  });
                }}
              >
                {curricula.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
          )}
          {ready && !loadError && selected && !current && (
            <p role="alert">
              This lesson was not found or is not available to your account.
            </p>
          )}
          {curricula.length > 0 && (
            <label>
              Category
              <select
                value={category}
                onChange={(e) => {
                  navigate({
                    curriculum: activeCurriculum,
                    category: e.target.value,
                    mode: "",
                    block: "",
                    lesson: "",
                    asset: "",
                    action: "",
                    form: "",
                  });
                }}
              >
                <option value="">All categories</option>
                {[
                  ...new Set(
                    visibleLessons
                      .filter((l) => l.curriculum === activeCurriculum)
                      .map((l) => text(l, "category") || "General"),
                  ),
                ].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          )}
          {curricula.length > 0 && (
            <label>
              Block
              <select
                value={block}
                onChange={(e) =>
                  navigate({
                    curriculum: activeCurriculum,
                    block: e.target.value,
                    mode: "",
                    lesson: "",
                    asset: "",
                    action: "",
                    form: "",
                  })
                }
              >
                <option value="">All blocks</option>
                {[
                  ...new Set(
                    visibleLessons
                      .filter(
                        (l) =>
                          l.curriculum === activeCurriculum &&
                          (!category || l.category === category),
                      )
                      .map((l) => text(l, "module")),
                  ),
                ].map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        {ready && !loadError && !selected && !current && (
          <div className="library-empty">
            <EmptyArt name="icon-learn" />
            <h3>
              {visibleLessons.length
                ? "No lessons in this selection"
                : canWrite
                  ? "Create your first learning path"
                  : "Your lessons will appear here"}
            </h3>
            <p>
              {canWrite
                ? "Organise lessons into curricula, categories and blocks, then add recordings and music notes."
                : "Your teacher’s published lessons appear for your assigned batch or level."}
            </p>
            {visibleLessons.length > 0 && (
              <button
                onClick={() =>
                  navigate({ category: "", block: "", lesson: "", asset: "" })
                }
              >
                Show all lessons in this curriculum
              </button>
            )}
          </div>
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
              {[
                ...new Set(
                  lessons.map((l) => text(l, "category") || "General"),
                ),
              ].map((cat) => (
                <section className="curriculum-category" key={cat}>
                  <h4>{cat}</h4>
                  {[
                    ...new Set(
                      lessons
                        .filter(
                          (l) => (text(l, "category") || "General") === cat,
                        )
                        .map((l) => text(l, "module")),
                    ),
                  ].map((block) => (
                    <div className="curriculum-block" key={block}>
                      <h5>{block}</h5>
                      {lessons
                        .filter(
                          (l) =>
                            (text(l, "category") || "General") === cat &&
                            l.module === block,
                        )
                        .map((l) => (
                          <button
                            key={l.id}
                            className="lesson-track"
                            aria-current={
                              current.id === l.id ? "step" : undefined
                            }
                            onClick={() => setSelected(l.id)}
                          >
                            <RagaCover
                              raga={text(l, "raga")}
                              tala={text(l, "tala")}
                              size={36}
                            />
                            <span>{text(l, "title")}</span>
                            <small>
                              {completed(l.id)
                                ? "Completed"
                                : l.published
                                  ? "Lesson"
                                  : "Draft"}
                            </small>
                          </button>
                        ))}
                    </div>
                  ))}
                </section>
              ))}
            </nav>
            <article
              className="record-card lesson-reader"
              key={current.id}
              ref={reader}
            >
              <div className="lesson-hero">
                <RagaCover
                  raga={text(current, "raga")}
                  tala={text(current, "tala")}
                  size={96}
                />
                <div>
                  <small>
                    Lesson {index + 1} of {lessons.length} ·{" "}
                    {text(current, "level")}
                  </small>
                  <h3>{text(current, "title")}</h3>
                  {(text(current, "raga") || text(current, "tala")) && (
                    <p className="lesson-facts">
                      {text(current, "raga") && (
                        <span>
                          Raga <strong>{text(current, "raga")}</strong>
                        </span>
                      )}
                      {text(current, "tala") && (
                        <span>
                          Tala <strong>{text(current, "tala")}</strong>
                        </span>
                      )}
                    </p>
                  )}
                </div>
                {editable ? (
                  <span className="lesson-hero-actions">
                    {canWrite && (
                      <button
                        className="button secondary"
                        onClick={() => {
                          setPracticeLesson(current.id);
                          openWorkflow("Assign practice");
                        }}
                      >
                        Assign practice
                      </button>
                    )}
                  <CopyLink
                    href={resourceLink(tools.school.id, {
                      page: "lesson",
                      lesson: current.id,
                    })}
                  />
                  </span>
                ) : (
                  <span />
                )}
              </div>
              {editable && (
                <>
                  <div className="lesson-publication">
                    <div>
                      <Badge tone={current.published ? "success" : "neutral"}>
                        {current.published ? "Published" : "Draft"}
                      </Badge>
                      <span>
                        <Users size={14} />
                        {audienceName}
                      </span>
                    </div>{" "}
                    <button
                      className="button secondary"
                      disabled={tools.busy}
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
                  </div>
                  <div
                    className="view-switch lesson-mode"
                    aria-label="Lesson authoring views"
                  >
                    {[
                      ["preview", "Lesson"],
                      ["materials", "Materials"],
                      ["edit", "Edit details"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        aria-pressed={authorMode === value}
                        onClick={() =>
                          navigate({
                            lesson: current.id,
                            mode: value,
                            action: "",
                            form: "",
                            asset: "",
                          })
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <div hidden={!!editable && authorMode === "edit"}>
                <p className="fine">
                  {activeCurriculum} / {text(current, "category")} /{" "}
                  {text(current, "module")}
                </p>
                <p className="lesson-instructions">
                  {text(current, "instructions")}
                </p>
                {text(current, "music_notes") &&
                  (scoredRecording(current.id) ? (
                    <details className="written-notes">
                      <summary>Notes as text</summary>
                      <pre className="music-notes">
                        {text(current, "music_notes")}
                      </pre>
                    </details>
                  ) : (
                    <section>
                      <h4>Music notes</h4>
                      <pre className="music-notes">
                        {text(current, "music_notes")}
                      </pre>
                    </section>
                  ))}
                {assetId && (
                  <>
                    <button onClick={() => setAssetId("")}>
                      Show all lesson assets
                    </button>
                    {!data.assets.some(
                      (a) => a.id === assetId && a.lesson_id === current.id,
                    ) && (
                      <p role="alert">
                        This asset is not available in this lesson.
                      </p>
                    )}
                  </>
                )}
                {editable &&
                  authorMode === "preview" &&
                  !data.assets.some((a) => a.lesson_id === current.id) && (
                    <div className="lesson-material-empty">
                      <UploadCloud size={22} />
                      <h4>Add a reference for this lesson</h4>
                      <p>
                        Audio, video and notation give learners something to
                        practise with.
                      </p>
                      <button
                        className="button secondary"
                        onClick={() =>
                          navigate({
                            lesson: current.id,
                            mode: "materials",
                            action: "",
                            form: "",
                          })
                        }
                      >
                        Add lesson material
                      </button>
                    </div>
                  )}
                {data.assets
                  .filter(
                    (a) =>
                      a.lesson_id === current.id &&
                      (!assetId || a.id === assetId) &&
                      // A learner already reads the lesson's notes above; the
                      // same notes as a text file would be a third copy.
                      (!!editable ||
                        !text(current, "music_notes") ||
                        text(a, "mime") !== "text/plain"),
                  )
                  .map((a) => (
                    <LessonMaterial
                      key={a.id}
                      tools={tools}
                      asset={a}
                      lesson={current}
                      editable={!!editable && authorMode === "materials"}
                      staff={!!editable}
                      onSaved={() => void load()}
                    />
                  ))}
                {editable && authorMode === "materials" && (
                  <section className="lesson-upload-panel">
                    <h4>Add lesson material</h4>
                    <p>
                      Upload recordings, video or notation. Use the audio
                      player’s timing editor to align your notes.
                    </p>
                    <Upload
                      tools={tools}
                      lesson={current.id}
                      onReady={() => void load()}
                    />
                  </section>
                )}
              </div>
              {editable && (
                <div
                  hidden={authorMode !== "edit"}
                  className="lesson-edit-panel"
                >
                  <WorkflowForm
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
                          category: f.get("category"),
                          categoryPosition: Number(f.get("categoryPosition")),
                          module: f.get("module"),
                          blockPosition: Number(f.get("blockPosition")),
                          raga: f.get("raga"),
                          tala: f.get("tala"),
                        })
                      ) {
                        navigate({ mode: "preview", action: "", form: "" });
                        await load();
                      }
                    }}
                  >
                    <LessonFields initial={current} suggestions={suggestions} />
                    <div className="composer-footer wide">
                      <p>
                        {current.published
                          ? "Saving updates the published lesson for its current audience."
                          : "Saving keeps this lesson as a draft."}
                      </p>
                      <button className="button primary" disabled={tools.busy}>
                        Save lesson
                      </button>
                    </div>
                  </WorkflowForm>
                </div>
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
                      ? "Still practising this one"
                      : "I’ve learned this lesson"}
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
          <WorkflowPanel
            title="Assign practice"
            description="A small, specific exercise with a due day. It appears on the learner’s home and grows their tulsi when done."
          >
            <WorkflowForm
              className="form-grid"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                if (
                  await tools.command("practice.create", {
                    lesson: practiceLesson || current?.id,
                    learner,
                    text: f.get("text"),
                    due: f.get("due"),
                  })
                )
                  navigate({ action: "", form: "" });
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
                rows={[
                  ...new Map(
                    (manage ? roster.learners : learners).map((l) => [l.id, l]),
                  ).values(),
                ]}
              />
              <label>
                Due
                <input type="date" name="due" required />
              </label>
              <label>
                Exercise
                <textarea name="text" required />
              </label>
              <button className="button primary">Assign practice</button>
            </WorkflowForm>
          </WorkflowPanel>
        )}
      </div>
    </>
  );
}
