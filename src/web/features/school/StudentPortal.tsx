import { useRouteValue, navigate } from "../../routes";
import { useEffect, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardList,
  FileAudio,
  MessageSquare,
  Play,
  Settings2,
  Users,
  ArrowUpRight,
} from "lucide-react";
import { type Row, type SchoolTools, text, num } from "./common";
import {
  Action,
  Badge,
  SectionTitle,
  EmptyState,
  dateLabel,
} from "../../components/ui";
import { Upload, Review, LibraryView } from "./Learning";
import { Statement, TeacherAttendance, FamilyEvents } from "./Community";
export function PortalView({ tools }: { tools: SchoolTools }) {
  const [data, setData] = useState<Record<string, Row[]>>({});
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [assignmentFilter, setAssignmentFilter] = useRouteValue(
    "assignmentFilter",
    "all",
  );
  const [submitted, setSubmitted] = useState("");
  const [page, setPage] = useRouteValue("section", "overview");
  const [learnerId, setLearnerId] = useRouteValue("learner");
  const [selectedTest, setSelectedTest] = useRouteValue("test");
  const [selectedReview, setSelectedReview] = useRouteValue("review");
  const [assets, setAssets] = useState<Record<string, string[]>>({});
  const load = () =>
    tools
      .read<typeof data>("portal")
      .then((result) => {
        setData(result);
        setLoadError("");
      })
      .catch((e) => setLoadError(e.message))
      .finally(() => setReady(true));
  useEffect(() => {
    void load();
  }, [tools.read]);
  const learners = data.learners || [],
    teaching = data.teachingBatches || [],
    households = data.households || [];
  const learner = learners.find((l) => l.id === learnerId) || learners[0];
  const id = learner?.id || "";
  const practice = (data.practice || []).filter((p) => p.learner_id === id);
  const tests = (data.tests || []).filter((t) => t.learner_id === id);
  const submissions = (data.submissions || []).filter(
    (s) => s.learner_id === id,
  );
  const published = submissions.filter((s) => s.review_published_at);
  const classes = (data.classes || []).filter(
    (c) =>
      teaching.some((b) => b.id === c.batch_id) ||
      ((c.learner_ids as string[]) || []).includes(id),
  );
  const upcoming = classes.filter(
    (c) =>
      c.status === "scheduled" &&
      new Date(text(c, "ends_at")).getTime() > Date.now(),
  );
  const selected = tests.find((t) => t.id === selectedTest);
  const review = published.find((s) => s.id === selectedReview);
  const assignmentVersions = submissions.filter(
    (s) => s.assessment_id === selectedTest,
  );
  const hasSubmission = (test: Row) =>
    submissions.some((s) => s.assessment_id === test.id);
  const visibleTests = tests.filter((test) =>
    assignmentFilter === "todo"
      ? !hasSubmission(test)
      : assignmentFilter === "submitted"
        ? hasSubmission(test)
        : true,
  );
  const selectedAssets = assets[selectedTest + ":" + id] || [];
  const pendingPractice = practice.filter((p) => !p.completed_at);
  const nav = [
    { id: "overview", label: "Overview", icon: BookOpen, show: true },
    {
      id: "curriculum",
      label: "Curriculum",
      icon: Play,
      show: !!learner || teaching.length > 0,
    },
    {
      id: "assignments",
      label: "Assignments",
      icon: ClipboardList,
      show: !!learner,
    },
    { id: "feedback", label: "Feedback", icon: MessageSquare, show: !!learner },
    {
      id: "classes",
      label: "Classes",
      icon: CalendarDays,
      show: !!learner || teaching.length > 0,
    },
    { id: "family", label: "Family", icon: Users, show: households.length > 0 },
    { id: "settings", label: "Settings", icon: Settings2, show: !!learner },
  ].filter((n) => n.show);
  const go = (next: string) => {
    navigate({
      section: next,
      test: "",
      review: "",
      lesson: "",
      asset: "",
      action: "",
    });
  };
  const openTest = (test: string) => {
    navigate({ section: "assignments", test, review: "" });
  };
  const classRow = (c: Row, attendance = false) => (
    <article key={c.id} className="learning-class-row">
      <div className="class-date">
        <strong>{new Date(text(c, "starts_at")).getDate()}</strong>
        <span>
          {new Date(text(c, "starts_at")).toLocaleString("en", {
            month: "short",
          })}
        </span>
      </div>
      <div className="row-main">
        <strong>{text(c, "batch_name")}</strong>
        <p>{dateLabel(text(c, "starts_at"), true)}</p>
        {text(c, "location") && (
          <p>
            {/^https?:\/\//i.test(text(c, "location")) ? (
              <a href={text(c, "location")} target="_blank" rel="noreferrer">
                Open class meeting <ArrowUpRight size={13} />
              </a>
            ) : (
              text(c, "location")
            )}
          </p>
        )}
        {attendance &&
          c.status !== "cancelled" &&
          teaching.some((b) => b.id === c.batch_id) && (
            <TeacherAttendance
              tools={tools}
              occurrence={c}
              learners={(data.teachingLearners || []).filter(
                (l) => l.batch_id === c.batch_id,
              )}
            />
          )}
      </div>
      <Badge tone={c.status === "cancelled" ? "attention" : "neutral"}>
        {text(c, "status")}
      </Badge>
    </article>
  );
  const assignmentRow = (t: Row) => {
    const versions = submissions.filter((s) => s.assessment_id === t.id);
    const overdue =
      !versions.length && new Date(text(t, "due_at")).getTime() < Date.now();
    return (
      <div className="learning-row" key={t.id}>
        <span className="row-icon">
          <FileAudio size={18} />
        </span>
        <div className="row-main">
          <strong>{text(t, "title")}</strong>
          <p>
            Due {dateLabel(text(t, "due_at"), true)}
            {versions.length
              ? ` · ${versions.length} submitted version${versions.length === 1 ? "" : "s"}`
              : ""}
          </p>
        </div>
        <Badge tone={versions.length ? "success" : "attention"}>
          {versions.length ? "Submitted" : overdue ? "Past due" : "To do"}
        </Badge>
        <Action
          onClick={() => openTest(t.id)}
          aria-label={`Open ${text(t, "title")}`}
        >
          <ChevronRight size={16} />
        </Action>
      </div>
    );
  };
  if (!ready) return <p role="status">Loading your learning space…</p>;
  if (loadError)
    return (
      <section className="learning-panel">
        <SectionTitle title="Your learning space couldn’t load" />
        <p role="alert">{loadError}</p>
        <Action onClick={() => void load()}>Try again</Action>
      </section>
    );
  return (
    <div className="learning-space">
      <div className="learning-page-title">
        <div>
          <span className="eyebrow">
            {teaching.length ? "LEARNING & TEACHING" : "STUDENT WORKSPACE"}
          </span>
          <h1>{teaching.length && !learner ? "Teaching" : "My learning"}</h1>
          <p>A little practice, every day.</p>
        </div>
        {learner && (
          <div className="learner-switch">
            <span className="learner-monogram">
              {text(learner, "name")
                .split(" ")
                .map((s) => s[0])
                .slice(-2)
                .join("")}
            </span>
            {learners.length > 1 ? (
              <label>
                Learning as
                <select
                  aria-label="Learning as"
                  value={id}
                  onChange={(e) => {
                    navigate({
                      learner: e.target.value,
                      test: "",
                      review: "",
                      lesson: "",
                      asset: "",
                      action: "",
                      form: "",
                    });
                    setSubmitted("");
                  }}
                >
                  {learners.map((l) => (
                    <option key={l.id} value={l.id}>
                      {text(l, "name")}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div>
                <strong>{text(learner, "name")}</strong>
                <span>{text(learner, "level")}</span>
              </div>
            )}
          </div>
        )}
      </div>
      <div
        className="learning-tabs"
        role="navigation"
        aria-label="Learning sections"
      >
        {nav.map((n) => (
          <Action
            key={n.id}
            variant="quiet"
            aria-current={page === n.id ? "page" : undefined}
            onClick={() => go(n.id)}
          >
            <n.icon size={15} />
            {n.label}
          </Action>
        ))}
      </div>
      {page === "overview" && (
        <>
          {(learner || teaching.length > 0) && (
            <section className="learning-continue">
              <div className="continue-symbol">
                <BookOpen size={28} />
              </div>
              <div>
                <span className="eyebrow">
                  {learner ? "YOUR CURRICULUM" : "YOUR TEACHING MATERIAL"}
                </span>
                <h2>
                  {learner
                    ? "Make room for music."
                    : "Prepare your next class."}
                </h2>
                <p>Lessons, recordings and music notes, together.</p>
              </div>
              <Action variant="primary" onClick={() => go("curriculum")}>
                {learner ? "Continue learning" : "Open curriculum"}
                <ChevronRight size={16} />
              </Action>
            </section>
          )}
          <div className="learning-columns">
            <section className="learning-panel">
              <SectionTitle
                title="Upcoming classes"
                action={
                  <Action variant="quiet" onClick={() => go("classes")}>
                    View all
                    <ChevronRight size={14} />
                  </Action>
                }
              />
              {upcoming.slice(0, 2).map((c) => classRow(c))}
              {!upcoming.length && (
                <EmptyState>No classes scheduled yet.</EmptyState>
              )}
            </section>
            {learner && (
              <section className="learning-panel">
                <SectionTitle
                  title="Your practice"
                  detail={`${pendingPractice.length} to do`}
                />
                {practice.slice(0, 3).map((p) => (
                  <div className="practice-row" key={p.id}>
                    <span
                      className={`practice-check ${p.completed_at ? "done" : ""}`}
                    >
                      {p.completed_at ? (
                        <Check size={14} />
                      ) : (
                        <BookOpen size={14} />
                      )}
                    </span>
                    <div className="row-main">
                      <strong>{text(p, "text")}</strong>
                      <p>Due {dateLabel(text(p, "due_on").slice(0, 10))}</p>
                    </div>
                    {p.completed_at ? (
                      <Badge tone="success">Done</Badge>
                    ) : (
                      <Action
                        onClick={async () => {
                          if (
                            await tools.command("practice.complete", {
                              id: p.id,
                            })
                          )
                            await load();
                        }}
                      >
                        Mark practised
                      </Action>
                    )}
                  </div>
                ))}
                {!practice.length && (
                  <EmptyState>Your teacher will add practice here.</EmptyState>
                )}
              </section>
            )}
          </div>
          {learner && (
            <section className="learning-panel">
              <SectionTitle
                title="Assignments"
                detail="Record your progress and share it with your teacher."
                action={
                  <Action variant="quiet" onClick={() => go("assignments")}>
                    View all
                    <ChevronRight size={14} />
                  </Action>
                }
              />
              {tests.slice(0, 3).map(assignmentRow)}
              {!tests.length && <EmptyState>You’re all caught up.</EmptyState>}
            </section>
          )}
          {published.length > 0 && (
            <section className="learning-panel">
              <SectionTitle title="Latest feedback" />
              <div className="learning-row">
                <span className="row-icon">
                  <MessageSquare size={18} />
                </span>
                <div className="row-main">
                  <strong>{text(published[0], "title")}</strong>
                  <p>
                    Your teacher’s feedback is ready · version{" "}
                    {num(published[0], "version")}
                  </p>
                </div>
                <Action
                  onClick={() => {
                    navigate({
                      section: "feedback",
                      review: published[0].id,
                      test: "",
                    });
                  }}
                >
                  Read feedback
                  <ChevronRight size={14} />
                </Action>
              </div>
            </section>
          )}
        </>
      )}
      {page === "curriculum" && (
        <LibraryView
          key={id || "teacher"}
          tools={tools}
          manage={false}
          batches={teaching}
          learners={data.teachingLearners || []}
          portalLearners={learner ? [learner] : []}
        />
      )}
      {page === "assignments" && (
        <>
          <SectionTitle
            title="Assignments"
            detail="Each submission keeps its own recording and feedback."
          />
          {!selected ? (
            <>
              {selectedTest && (
                <p role="status" className="notice">
                  This assignment isn’t available for the selected learner.
                  Choose one below.
                </p>
              )}
              <div
                className="assignment-filters"
                aria-label="Filter assignments"
              >
                {[
                  ["all", "All", tests.length],
                  [
                    "todo",
                    "To do",
                    tests.filter((t) => !hasSubmission(t)).length,
                  ],
                  [
                    "submitted",
                    "Submitted",
                    tests.filter(hasSubmission).length,
                  ],
                ].map(([value, label, count]) => (
                  <Action
                    key={value}
                    variant="quiet"
                    aria-pressed={assignmentFilter === value}
                    onClick={() => setAssignmentFilter(String(value))}
                  >
                    {label}
                    <span>{count}</span>
                  </Action>
                ))}
              </div>
              <section className="learning-panel">
                {visibleTests.map(assignmentRow)}
                {!visibleTests.length && (
                  <EmptyState>
                    {tests.length
                      ? "No assignments in this view."
                      : "Your teacher hasn’t assigned a test yet. When one is ready, the instructions and due date will appear here."}
                  </EmptyState>
                )}
              </section>
            </>
          ) : (
            <article className="assessment-detail">
              <Action variant="quiet" onClick={() => setSelectedTest("")}>
                ← All assignments
              </Action>
              <div className="assessment-title">
                <span className="row-icon">
                  <FileAudio size={22} />
                </span>
                <div>
                  <h2>{text(selected, "title")}</h2>
                  <p>
                    For {text(learner!, "name")} · Due{" "}
                    {dateLabel(text(selected, "due_at"), true)}
                  </p>
                </div>
              </div>
              <div className="submission-steps" aria-label="Submission steps">
                <span>
                  <Check size={15} /> Read instructions
                </span>
                <span className={!selectedAssets.length ? "current" : ""}>
                  <FileAudio size={15} /> Choose recordings
                </span>
                <span className={selectedAssets.length ? "current" : ""}>
                  <ClipboardList size={15} /> Submit for review
                </span>
              </div>
              <section className="assignment-instructions">
                <h3>What to prepare</h3>
                <p>
                  {text(selected, "instructions") ||
                    "Ask your teacher which exercise to record."}
                </p>
              </section>
              {submitted === selected.id + ":" + id && (
                <div className="submission-receipt" role="status">
                  <Check size={20} />
                  <div>
                    <strong>Your recording is submitted</strong>
                    <p>
                      {text(learner!, "name")} · {text(selected, "title")}. Your
                      teacher can now review this version.
                    </p>
                  </div>
                </div>
              )}
              <h3 className="submission-heading">Your recordings</h3>
              <p className="fine">
                Upload a recording or select a previous file below. Only
                selected files are submitted.
              </p>
              <Upload
                tools={tools}
                learner={id}
                onReady={(asset) => {
                  void load();
                  setAssets((a) => ({
                    ...a,
                    [selected.id + ":" + id]: [
                      ...(a[selected.id + ":" + id] || []),
                      asset,
                    ],
                  }));
                }}
              />
              {(data.recordings || []).filter((a) => a.learner_id === id)
                .length > 0 && (
                <>
                  <h3>Choose recordings</h3>
                  <div className="recording-list">
                    {(data.recordings || [])
                      .filter((a) => a.learner_id === id)
                      .map((a, i) => (
                        <label className="recording-choice" key={a.id}>
                          <input
                            type="checkbox"
                            checked={(
                              assets[selected.id + ":" + id] || []
                            ).includes(a.id)}
                            onChange={(e) =>
                              setAssets((v) => ({
                                ...v,
                                [selected.id + ":" + id]: e.target.checked
                                  ? [...(v[selected.id + ":" + id] || []), a.id]
                                  : (v[selected.id + ":" + id] || []).filter(
                                      (v) => v !== a.id,
                                    ),
                              }))
                            }
                          />
                          <FileAudio size={17} />
                          <span>
                            <strong>{text(a, "filename")}</strong>
                            <small>
                              Recording {i + 1} · {num(a, "duration_ms") / 1000}
                              s · {dateLabel(text(a, "created_at"), true)}
                            </small>
                          </span>
                        </label>
                      ))}
                  </div>
                </>
              )}
              <div className="assessment-submit">
                <span>
                  <strong>
                    {selectedAssets.length} recording
                    {selectedAssets.length === 1 ? "" : "s"} selected
                  </strong>
                  <small>
                    Submitting for {text(learner!, "name")}
                    {assignmentVersions.length
                      ? " · creates a new version"
                      : ""}
                  </small>
                </span>
                <Action
                  variant="primary"
                  disabled={!(assets[selected.id + ":" + id] || []).length}
                  onClick={async () => {
                    if (
                      await tools.command("test.submit", {
                        test: selected.id,
                        learner: id,
                        assets: assets[selected.id + ":" + id],
                      })
                    ) {
                      setAssets((a) => ({
                        ...a,
                        [selected.id + ":" + id]: [],
                      }));
                      setSubmitted(selected.id + ":" + id);
                      await load();
                    }
                  }}
                >
                  {assignmentVersions.length
                    ? "Submit new version"
                    : "Submit recording"}
                </Action>
              </div>
              <h3>Submission history</h3>
              {submissions
                .filter((s) => s.assessment_id === selected.id)
                .map((s) => (
                  <div className="learning-row" key={s.id}>
                    <div className="row-main">
                      <strong>Version {num(s, "version")}</strong>
                      <p>{dateLabel(text(s, "created_at"), true)}</p>
                    </div>
                    <Badge tone={s.review_published_at ? "success" : "neutral"}>
                      {s.review_published_at
                        ? "Feedback ready"
                        : "Awaiting review"}
                    </Badge>
                  </div>
                ))}
            </article>
          )}
        </>
      )}
      {page === "feedback" && (
        <>
          <SectionTitle
            title="Teacher feedback"
            detail="Listen again with feedback at the exact moment in your recording."
          />
          {review ? (
            <>
              <Action variant="quiet" onClick={() => setSelectedReview("")}>
                ← All feedback
              </Action>
              <Review
                tools={tools}
                submission={review}
                labels={[]}
                canPublish={false}
              />
            </>
          ) : (
            <section className="learning-panel">
              {published.map((s) => (
                <div className="learning-row" key={s.id}>
                  <span className="row-icon">
                    <MessageSquare size={18} />
                  </span>
                  <div className="row-main">
                    <strong>{text(s, "title")}</strong>
                    <p>
                      Version {num(s, "version")} ·{" "}
                      {dateLabel(text(s, "review_published_at"))}
                    </p>
                  </div>
                  <Action onClick={() => setSelectedReview(s.id)}>
                    Read feedback
                    <ChevronRight size={14} />
                  </Action>
                </div>
              ))}
              {!published.length && (
                <EmptyState>
                  Published feedback will appear here.{" "}
                  {submissions.length > 0
                    ? "Your recordings are awaiting review."
                    : ""}
                </EmptyState>
              )}
            </section>
          )}
        </>
      )}
      {page === "classes" && (
        <>
          <SectionTitle
            title="Classes"
            detail={`Times shown in ${Intl.DateTimeFormat().resolvedOptions().timeZone}.`}
          />
          <section className="learning-panel">
            {classes.map((c) => classRow(c, true))}
            {!classes.length && <EmptyState>No classes scheduled.</EmptyState>}
          </section>
          {learner && (
            <p className="learning-footnote">
              Attendance:{" "}
              {
                (data.attendance || []).filter(
                  (a) => a.learner_id === id && a.status === "present",
                ).length
              }{" "}
              present out of{" "}
              {
                (data.attendance || []).filter((a) => a.learner_id === id)
                  .length
              }{" "}
              marked classes.
            </p>
          )}
        </>
      )}
      {page === "family" && (
        <>
          <SectionTitle
            title="Family"
            detail="Shared statements and events for your household."
          />
          {households.map((h) => (
            <Statement tools={tools} household={h} key={h.id} />
          ))}
          <FamilyEvents tools={tools} />
        </>
      )}
      {page === "settings" && learner && (
        <>
          <SectionTitle
            title="Learning privacy"
            detail={`Optional permissions for ${text(learner, "name")}. Your class access does not depend on these choices.`}
          />
          <section className="learning-panel">
            {["recording-reuse", "label-export"].map((purpose) => (
              <label className="consent-row" key={purpose}>
                <span>
                  <strong>
                    {purpose === "recording-reuse"
                      ? "Recording reuse"
                      : "Feedback label export"}
                  </strong>
                  <small>
                    {purpose === "recording-reuse"
                      ? "Allow this learner’s recordings to be reused for dataset work."
                      : "Allow verified feedback labels to be included in dataset exports."}
                  </small>
                </span>
                <input
                  type="checkbox"
                  checked={(data.consents || []).some(
                    (d) =>
                      d.learner_id === id &&
                      d.purpose === purpose &&
                      d.allowed === true,
                  )}
                  onChange={async (e) => {
                    if (
                      await tools.command("dataset.consent", {
                        learner: id,
                        purpose,
                        allowed: e.target.checked,
                      })
                    )
                      await load();
                  }}
                />
              </label>
            ))}
          </section>
          <p className="learning-footnote">
            You can withdraw either permission at any time.
          </p>
        </>
      )}
    </div>
  );
}
