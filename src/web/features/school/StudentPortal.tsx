import { useRouteValue, navigate } from "../../routes";
import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Check,
  ChevronRight,
  ClipboardList,
  FileAudio,
  MessageSquare,
  ArrowUpRight,
} from "lucide-react";
import { type Row, type SchoolTools, text, num } from "./common";
import {
  Action,
  BackLink,
  Badge,
  SectionTitle,
  EmptyState,
  StatusPill,
  dateLabel,
} from "../../components/ui";
import { PageActions, PageHeader } from "../../components/PageHeader";
import {
  differentZone,
  formatRange,
  formatWhen,
  schoolDay,
  zoneName,
} from "../../lib/when";
import { AttendanceSheet } from "./AttendanceSheet";
import { FamilyBalance } from "./FamilyStatement";
import { Art } from "../../components/Art";
import { PracticeGrowth } from "../../components/Growth";
import { Upload, Review, LibraryView } from "./Learning";
import { Statement, FamilyEvents } from "./Community";
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
  const [occurrenceId] = useRouteValue("occurrence");
  const [familyView, setFamilyView] = useRouteValue("familyView");
  const [familyId, setFamilyId] = useRouteValue("household");
  const [familyEvent] = useRouteValue("event");
  const [familyForm] = useRouteValue("form");
  const showingFamilyEvents =
    familyView === "events" ||
    (!familyView &&
      (!!familyEvent ||
        familyForm === "confirm-participants-and-contribution"));
  const request = useRef(0);
  const [assets, setAssets] = useState<Record<string, string[]>>({});
  const load = async () => {
    const version = ++request.current;
    try {
      const result = await tools.read<typeof data>("portal");
      if (version === request.current) {
        setData(result);
        setLoadError("");
      }
    } catch (e) {
      if (version === request.current) setLoadError((e as Error).message);
    } finally {
      if (version === request.current) setReady(true);
    }
  };
  useEffect(() => {
    void load();
    return () => {
      request.current++;
    };
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
  const teachingClass = classes.find(
    (c) => c.id === occurrenceId && teaching.some((b) => b.id === c.batch_id),
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
  const roles = {
    learns: learners.length > 0,
    teaches: teaching.length > 0,
    billing: households.length > 0,
  };
  const firstName = (row?: Row) => text(row || {}, "name").split(" ")[0];
  // A family account follows its children; the header speaks about them.
  const forFamily = roles.billing && roles.learns;
  const owner = forFamily ? firstName(learner) + "’s" : "Your";
  const titles: Record<string, string> = {
    overview: forFamily
      ? learners.length > 1
        ? "Your family’s learning"
        : `${firstName(learner)}’s learning`
      : roles.learns
        ? roles.teaches
          ? "Learning & teaching"
          : "My learning"
        : roles.teaches
          ? "Teaching"
          : "Family",
    curriculum: "Lessons",
    assignments: "Assignments",
    feedback: "Feedback",
    classes: "Classes",
    family: "Fees & events",
    settings: "Learning privacy",
  };
  const zone = differentZone();
  const descriptions: Record<string, string> = {
    overview: forFamily
      ? "Fees, classes and practice, together."
      : roles.learns
        ? "A little practice, every day."
        : roles.teaches
          ? "Your classes, attendance and lessons."
          : "Your family’s fees and school events.",
    curriculum: roles.learns
      ? "Listen, watch and practise, one lesson at a time."
      : "Lessons for the batches you teach.",
    assignments: "Record an attempt and share it with your teacher.",
    feedback: "Your teacher’s notes, at the moment they’re about.",
    classes: zone ? `Times are ${zoneName(zone)}.` : "",
    family: "Statements, payments and event participation.",
    settings: learner
      ? `Optional permissions for ${text(learner, "name")}. Class access doesn’t depend on them.`
      : "",
  };
  const done = (who: string) =>
    (data.practice || []).filter(
      (p) => p.learner_id === who && p.completed_at,
    ).length +
    (data.lessonProgress || []).filter((p) => p.learner_id === who).length +
    (data.practiceLog || []).filter((p) => p.learner_id === who).length;
  const practisedToday = (data.practiceLog || []).some(
    (p) =>
      p.learner_id === id && text(p, "practised_on").slice(0, 10) === schoolDay(),
  );
  const teachingClasses = classes.filter((c) =>
    teaching.some((b) => b.id === c.batch_id),
  );
  const nextTeaching =
    teachingClasses.find(
      (c) =>
        c.status !== "cancelled" &&
        schoolDay(text(c, "starts_at")) === schoolDay() &&
        new Date(text(c, "ends_at")).getTime() > Date.now() - 6 * 3600000,
    ) ||
    teachingClasses.find(
      (c) =>
        c.status !== "cancelled" &&
        new Date(text(c, "ends_at")).getTime() > Date.now(),
    );
  const go = (next: string) => {
    navigate({
      section: next === "overview" ? "" : next,
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
  const takeAttendance = (c: Row) =>
    navigate({ section: "classes", occurrence: c.id, action: "", form: "" });
  const classRow = (c: Row, attendance = false) => (
    <article key={c.id} className="learning-class-row">
      <div className="class-date">
        <strong>{formatWhen(text(c, "starts_at"), "date").split(" ")[0]}</strong>
        <span>{formatWhen(text(c, "starts_at"), "date").split(" ")[1]}</span>
      </div>
      <div className="row-main">
        <strong>{text(c, "batch_name")}</strong>
        <p>{formatRange(text(c, "starts_at"), text(c, "ends_at"))}</p>
        {text(c, "location") && (
          <p>
            {/^https?:\/\//i.test(text(c, "location")) ? (
              <a href={text(c, "location")} target="_blank" rel="noreferrer">
                Open class meeting <ArrowUpRight size={13} aria-hidden="true" />
              </a>
            ) : (
              text(c, "location")
            )}
          </p>
        )}
      </div>
      <StatusPill status={text(c, "status")} usual="scheduled" />
      {attendance &&
        c.status !== "cancelled" &&
        teaching.some((b) => b.id === c.batch_id) && (
          <Action onClick={() => takeAttendance(c)}>Take attendance</Action>
        )}
    </article>
  );
  const assignmentRow = (t: Row) => {
    const versions = submissions.filter((s) => s.assessment_id === t.id);
    const overdue =
      !versions.length && new Date(text(t, "due_at")).getTime() < Date.now();
    return (
      <div className="learning-row" key={t.id}>
        <span className="row-icon">
          <FileAudio size={18} aria-hidden="true" />
        </span>
        <div className="row-main">
          <strong>{text(t, "title")}</strong>
          <p>
            Due {dateLabel(text(t, "due_at"), true)}
            {versions.length
              ? ` · ${versions.length} ${versions.length === 1 ? "attempt" : "attempts"} sent`
              : ""}
          </p>
        </div>
        <Badge tone={versions.length ? "success" : "attention"}>
          {versions.length ? "Sent" : overdue ? "Past due" : "To do"}
        </Badge>
        <Action
          onClick={() => openTest(t.id)}
          aria-label={`Open ${text(t, "title")}`}
        >
          <ChevronRight size={16} aria-hidden="true" />
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
    <PageHeader
      title={titles[page] || titles.overview}
      description={descriptions[page] || ""}
    >
      {learners.length > 1 && page !== "family" && (
        <PageActions>
          <label className="learner-picker">
            Showing
            <select
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
        </PageActions>
      )}
    <div className="learning-space">
      {page === "overview" && (
        <>
          {roles.teaches && (
            <section className="teaching-focus">
              <div>
                <span className="eyebrow">
                  {nextTeaching &&
                  schoolDay(text(nextTeaching, "starts_at")) === schoolDay()
                    ? "Today"
                    : "Next class"}
                </span>
                <h2>
                  {nextTeaching
                    ? text(nextTeaching, "batch_name")
                    : "No classes coming up"}
                </h2>
                <p>
                  {nextTeaching
                    ? formatRange(
                        text(nextTeaching, "starts_at"),
                        text(nextTeaching, "ends_at"),
                      ) +
                      (text(nextTeaching, "location")
                        ? " · " + text(nextTeaching, "location")
                        : "")
                    : "When the office schedules your batch, it will appear here."}
                </p>
                <div className="teaching-focus-actions">
                  {nextTeaching && (
                    <Action
                      variant="primary"
                      onClick={() => takeAttendance(nextTeaching)}
                    >
                      Take attendance
                    </Action>
                  )}
                  <Action onClick={() => go("curriculum")}>Open lessons</Action>
                </div>
              </div>
              <Art name="tala-ring" size={160} className="teaching-focus-art" />
            </section>
          )}
          {roles.billing &&
            households.map((h) => (
              <FamilyBalance key={h.id} tools={tools} household={h} />
            ))}
          {learner && (
            <section className="learning-continue">
              <div className="learning-continue-copy">
                <span className="eyebrow">
                  {forFamily ? `${firstName(learner)}’s lessons` : "Your lessons"}
                </span>
                <h2>Make room for the music.</h2>
                <p>Lessons, recordings and music notes, together.</p>
                <Action variant="primary" onClick={() => go("curriculum")}>
                  Continue learning
                  <ChevronRight size={16} aria-hidden="true" />
                </Action>
              </div>
              <PracticeGrowth
                done={done(id)}
                owner={owner}
                practisedToday={practisedToday}
                onPractised={async () => {
                  if (await tools.command("practice.log", { learner: id }))
                    await load();
                }}
              />
            </section>
          )}
          {!learner && roles.teaches && (
            <section className="learning-panel">
              <SectionTitle
                title="Upcoming classes"
                action={
                  <Action variant="quiet" onClick={() => go("classes")}>
                    All classes
                    <ChevronRight size={14} aria-hidden="true" />
                  </Action>
                }
              />
              {upcoming.slice(0, 4).map((c) => classRow(c, true))}
              {!upcoming.length && (
                <EmptyState art="no-classes">
                  No classes scheduled yet.
                </EmptyState>
              )}
            </section>
          )}
          {learner && (
          <div className="learning-columns">
            <section className="learning-panel">
              <SectionTitle
                title={
                  forFamily
                    ? `${firstName(learner)}’s classes`
                    : "Upcoming classes"
                }
                action={
                  <Action variant="quiet" onClick={() => go("classes")}>
                    All classes
                    <ChevronRight size={14} aria-hidden="true" />
                  </Action>
                }
              />
              {upcoming.slice(0, 2).map((c) => classRow(c, true))}
              {!upcoming.length && (
                <EmptyState art="no-classes">
                  No classes scheduled yet.
                </EmptyState>
              )}
            </section>
            <section className="learning-panel">
                <SectionTitle
                  title={forFamily ? "Practice to do" : "Your practice"}
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
                  <EmptyState art="practice-corner">
                    Nothing assigned yet. A day of your own practice still
                    counts: tap “I practised today”.
                  </EmptyState>
                )}
              </section>
          </div>
          )}
          {learner && (
            <section className="learning-panel">
              <SectionTitle
                title="Assignments"
                action={
                  <Action variant="quiet" onClick={() => go("assignments")}>
                    All assignments
                    <ChevronRight size={14} aria-hidden="true" />
                  </Action>
                }
              />
              {tests.slice(0, 3).map(assignmentRow)}
              {!tests.length && (
                <EmptyState art="all-caught-up">
                  You’re all caught up.
                </EmptyState>
              )}
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
                    Feedback is ready · attempt {num(published[0], "version")}
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
                  <EmptyState
                    art={tests.length ? "icon-record" : "all-caught-up"}
                  >
                    {tests.length
                      ? "No assignments in this view."
                      : "Your teacher hasn’t assigned a test yet. When one is ready, the instructions and due date will appear here."}
                  </EmptyState>
                )}
              </section>
            </>
          ) : (
            <article className="assessment-detail">
              <BackLink onClick={() => setSelectedTest("")}>
                All assignments
              </BackLink>
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
                      teacher can now listen and reply.
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
                      ? ` · this will be attempt ${assignmentVersions.length + 1}`
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
                    ? "Send another attempt"
                    : "Send recording"}
                </Action>
              </div>
              <h3>Your attempts</h3>
              {submissions
                .filter((s) => s.assessment_id === selected.id)
                .map((s) => (
                  <div className="learning-row" key={s.id}>
                    <div className="row-main">
                      <strong>Attempt {num(s, "version")}</strong>
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
          {review ? (
            <>
              <BackLink onClick={() => setSelectedReview("")}>
                All feedback
              </BackLink>
              <Review
                key={review.id}
                tools={tools}
                submission={{
                  ...review,
                  learner_name: text(learner || {}, "name"),
                }}
                labels={[]}
                canPublish={false}
                rubric={
                  (data.tests.find((test) => test.id === review.assessment_id)
                    ?.rubric || []) as { name: string; max: number }[]
                }
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
                      Attempt {num(s, "version")} ·{" "}
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
                <EmptyState art="icon-feedback">
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
          {teachingClass ? (
            <>
              <BackLink
                onClick={() =>
                  navigate({ occurrence: "", action: "", form: "" })
                }
              >
                All classes
              </BackLink>
              <section className="learning-panel">
                {classRow(teachingClass)}
              </section>
              <AttendanceSheet
                key={teachingClass.id}
                tools={tools}
                occurrence={teachingClass.id}
                cancelled={teachingClass.status === "cancelled"}
                learners={[
                  ...new Map(
                    (data.teachingEnrollments || [])
                      .filter(
                        (l) =>
                          l.batch_id === teachingClass.batch_id &&
                          text(l, "starts_on").slice(0, 10) <=
                            schoolDay(text(teachingClass, "starts_at")) &&
                          (!l.ends_on ||
                            text(l, "ends_on").slice(0, 10) >=
                              schoolDay(text(teachingClass, "starts_at"))),
                      )
                      .map((l) => [l.id, { id: l.id, name: text(l, "name") }]),
                  ).values(),
                ]}
                saved={Object.fromEntries(
                  (data.teachingAttendance || [])
                    .filter((a) => a.occurrence_id === teachingClass.id)
                    .map((a) => [text(a, "learner_id"), text(a, "status")]),
                )}
                notes={text(teachingClass, "teaching_notes")}
                notesHint="Lesson notes are for staff on this class. Share instructions for learners through lessons or practice."
                onSaved={load}
              />
            </>
          ) : (
            <>
              {occurrenceId && (
                <p role="status">
                  This teaching class is unavailable. Choose a class assigned to
                  you below.
                </p>
              )}
              <section className="learning-panel">
                {classes.map((c) => classRow(c, true))}
                {!classes.length && (
                  <EmptyState art="no-classes">
                    No classes scheduled.
                  </EmptyState>
                )}
              </section>
            </>
          )}
          {learner && (
            <p className="learning-footnote">
              Attendance:{" "}
              {
                (data.attendance || []).filter(
                  (a) =>
                    a.learner_id === id &&
                    (a.status === "present" || a.status === "late"),
                ).length
              }{" "}
              attended out of{" "}
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
          <div
            className="family-view-nav"
            role="group"
            aria-label="Family sections"
          >
            <Action
              variant="quiet"
              aria-pressed={!showingFamilyEvents}
              onClick={() => {
                setFamilyView("statement");
                navigate({ event: "", action: "", form: "" });
              }}
            >
              Statements & payments
            </Action>
            <Action
              variant="quiet"
              aria-pressed={showingFamilyEvents}
              onClick={() => {
                setFamilyView("events");
                navigate({ action: "", form: "" });
              }}
            >
              Event participation
            </Action>
          </div>
          {showingFamilyEvents ? (
            <FamilyEvents tools={tools} />
          ) : (
            <>
              {households.length > 1 && (
                <label className="family-household-picker">
                  Household
                  <select
                    value={familyId || households[0]?.id || ""}
                    onChange={(e) => {
                      setFamilyId(e.target.value);
                      navigate({ action: "", form: "" });
                    }}
                  >
                    {households.map((h) => (
                      <option key={h.id} value={h.id}>
                        {text(h, "name")}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {(familyId
                ? households.filter((h) => h.id === familyId)
                : households.slice(0, 1)
              ).map((h) => (
                <Statement tools={tools} household={h} key={h.id} />
              ))}
              {familyId && !households.some((h) => h.id === familyId) && (
                <EmptyState>
                  This household statement is unavailable.{" "}
                  <button onClick={() => setFamilyId("")}>
                    Use your household
                  </button>
                </EmptyState>
              )}
            </>
          )}
        </>
      )}
      {page === "settings" && learner && (
        <>
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
    </PageHeader>
  );
}
