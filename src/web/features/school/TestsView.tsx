import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, ClipboardCheck, Search } from "lucide-react";
import { Review } from "./Review";
import { WorkflowForm } from "../../components/WorkflowForm";
import { WorkflowDetails } from "../../components/WorkflowDetails";
import { Badge, dateLabel } from "../../components/ui";
import { useRouteValue, navigate } from "../../routes";
import { type Row, type SchoolTools, text, num } from "./common";
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
  const [testId] = useRouteValue("test");
  const [reviewId] = useRouteValue("review");
  const [data, setData] = useState<{
      tests: Row[];
      submissions: Row[];
      taxonomies: Row[];
    }>({ tests: [], submissions: [], taxonomies: [] }),
    [learners, setLearners] = useState<Row[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [filter, setFilter] = useRouteValue("queue", "pending"),
    [query] = useRouteValue("q"),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState("");
  const request = useRef(0);
  async function load() {
    const id = ++request.current;
    setLoadError("");
    try {
      const result = await tools.read<typeof data>("tests");
      if (id === request.current) setData(result);
    } catch (e) {
      if (id === request.current) setLoadError((e as Error).message);
    } finally {
      if (id === request.current) setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    void load();
    if (manage)
      tools
        .read<{ learners: Row[] }>("roster")
        .then((r) => {
          if (active)
            setLearners([
              ...new Map(r.learners.map((l) => [l.id, l])).values(),
            ]);
        })
        .catch((e) => tools.setError(e.message));
    return () => {
      active = false;
      request.current++;
    };
  }, [tools.read, manage]);
  const review = data.submissions.find(
    (s) => s.id === reviewId && (!testId || s.assessment_id === testId),
  );
  const test = data.tests.find(
    (t) => t.id === (review ? review.assessment_id : testId),
  );
  const queue = data.submissions.filter(
    (s) => !testId || s.assessment_id === testId,
  );
  const shown = queue.filter(
    (s) =>
      (filter === "all" ||
        (filter === "published"
          ? !!s.review_published_at
          : !s.review_published_at)) &&
      `${text(s, "learner_name")} ${text(s, "title")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const back = () => navigate({ review: "", form: "", action: "" });
  return (
    <>
      {reviewId ? (
        <>
          <button className="back-link" onClick={back}>
            <ArrowLeft size={16} />
            Back to review queue
          </button>
          {loading ? (
            <p className="ui-empty" role="status">
              Loading review…
            </p>
          ) : loadError ? (
            <div role="alert" className="ui-empty">
              <p>{loadError}</p>
              <button onClick={() => void load()}>Try again</button>
            </div>
          ) : !review ? (
            <p className="ui-empty" role="alert">
              This review is not available to your account.
            </p>
          ) : (
            <Review
              key={review.id}
              tools={tools}
              submission={review}
              labels={
                (data.taxonomies.find(
                  (t) => t.version === test?.taxonomy_version,
                )?.labels || []) as string[]
              }
              rubric={(test?.rubric || []) as { name: string; max: number }[]}
              canPublish={canPublish}
              onUpdated={() => void load()}
            />
          )}
        </>
      ) : (
        <>
          {manage && (
            <div className="review-setup">
              <WorkflowDetails className="task-disclosure">
                <summary>Manage issue vocabulary</summary>
                <p className="fine">
                  Versions keep the labels on older tests consistent. Create a
                  new vocabulary when your review criteria change.
                </p>
                <WorkflowForm
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
                </WorkflowForm>
              </WorkflowDetails>
              <WorkflowDetails className="task-disclosure">
                <summary>Create test</summary>
                <WorkflowForm
                  className="form-grid"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const f = new FormData(form);
                    const created = await tools.command<{ id: string }>(
                      "test.create",
                      {
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
                      },
                    );
                    if (created) {
                      form.reset();
                      setSelected([]);
                      navigate({
                        test: created.id,
                        review: "",
                        action: "",
                        form: "",
                        q: "",
                        queue: "pending",
                      });
                      await load();
                    }
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
                        <option
                          key={num(t, "version")}
                          value={num(t, "version")}
                        >
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
                  <div className="wide">
                    <h3>Choose learners</h3>
                    <p className="fine">
                      {selected.length} selected · Each learner submits their
                      own recordings.
                    </p>
                  </div>
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
                  <button
                    className="button primary"
                    disabled={
                      tools.busy ||
                      selected.length === 0 ||
                      data.taxonomies.length === 0
                    }
                  >
                    Create and publish test
                  </button>
                </WorkflowForm>
              </WorkflowDetails>
            </div>
          )}
          {testId && (
            <button
              className="back-link"
              onClick={() =>
                navigate({ test: "", review: "", action: "", form: "" })
              }
            >
              <ArrowLeft size={16} />
              All tests and reviews
            </button>
          )}
          {testId && test && (
            <section className="test-detail">
              <div className="attendance-heading">
                <div>
                  <span className="eyebrow">Assessment</span>
                  <h2>{text(test, "title")}</h2>
                  <p>Due {dateLabel(text(test, "due_at"), true)}</p>
                </div>
                <Badge tone={test.published ? "success" : "neutral"}>
                  {test.published ? "Published" : "Hidden from learners"}
                </Badge>
              </div>
              <p className="test-instructions">{text(test, "instructions")}</p>
              {manage && (
                <WorkflowDetails
                  className="task-disclosure"
                  context={{ test: test.id }}
                >
                  <summary>Change deadline or availability</summary>
                  <WorkflowForm
                    className="form-grid"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      if (
                        await tools.command("test.update", {
                          id: test.id,
                          due: new Date(
                            String(f.get("due")) + "+05:30",
                          ).toISOString(),
                          published: f.get("published") === "on",
                        })
                      ) {
                        navigate({ action: "", form: "" });
                        await load();
                      }
                    }}
                  >
                    <label>
                      Extend deadline (IST)
                      <input
                        type="datetime-local"
                        name="due"
                        required
                        defaultValue={new Date(text(test, "due_at"))
                          .toLocaleString("sv-SE", { timeZone: "Asia/Kolkata" })
                          .replace(" ", "T")
                          .slice(0, 16)}
                      />
                    </label>
                    <label className="check-label">
                      <input
                        type="checkbox"
                        name="published"
                        defaultChecked={!!test.published}
                      />
                      Published
                    </label>
                    <button className="button secondary" disabled={tools.busy}>
                      Update availability
                    </button>
                  </WorkflowForm>
                </WorkflowDetails>
              )}
            </section>
          )}
          {!loading && testId && !test && !loadError && (
            <p role="alert" className="ui-empty">
              This test is not available to your account.
            </p>
          )}
          <div className="agenda-toolbar">
            <div>
              <h2>Review queue</h2>
              <p>
                {manage
                  ? "Give each recording your full attention."
                  : "Recordings from tests assigned to you."}
              </p>
            </div>
            <div className="view-switch" aria-label="Review status">
              {[
                ["pending", "Awaiting feedback"],
                ["published", "Published"],
                ["all", "All"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {label}{" "}
                  <span>
                    {
                      queue.filter(
                        (s) =>
                          value === "all" ||
                          (value === "published"
                            ? !!s.review_published_at
                            : !s.review_published_at),
                      ).length
                    }
                  </span>
                </button>
              ))}
            </div>
          </div>
          <label className="billing-search">
            <Search size={17} />
            <input
              aria-label="Search reviews"
              type="search"
              placeholder="Search learner or test…"
              value={query}
              onChange={(e) => navigate({ q: e.target.value }, true)}
            />
          </label>
          {loading ? (
            <p className="ui-empty" role="status">
              Loading tests and recordings…
            </p>
          ) : loadError ? (
            <div className="ui-empty" role="alert">
              <h3>We couldn’t load the review queue</h3>
              <p>{loadError}</p>
              <button onClick={() => void load()}>Try again</button>
            </div>
          ) : shown.length ? (
            <div className="review-queue">
              {shown.map((s) => (
                <button
                  className="review-queue-row"
                  key={s.id}
                  aria-label={`Review ${text(s, "learner_name")} · ${text(s, "title")} · version ${num(s, "version")}`}
                  onClick={() =>
                    navigate({
                      test: text(s, "assessment_id"),
                      review: s.id,
                      action: "",
                      form: "",
                    })
                  }
                >
                  <span className="review-avatar">
                    {text(s, "learner_name")
                      .split(" ")
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join("")}
                  </span>
                  <span className="review-queue-person">
                    <strong>{text(s, "learner_name")}</strong>
                    <small>
                      {text(s, "title")} · Version {num(s, "version")}
                    </small>
                    <small>
                      Submitted {dateLabel(text(s, "created_at"), true)}
                    </small>
                  </span>
                  <Badge tone={s.review_published_at ? "success" : "attention"}>
                    {s.review_published_at ? "Published" : "Awaiting feedback"}
                  </Badge>
                  <ArrowUpRight size={17} />
                </button>
              ))}
            </div>
          ) : (
            <div className="review-empty">
              <ClipboardCheck size={28} />
              <h3>
                {query
                  ? "No matching recordings"
                  : filter === "pending"
                    ? "No recordings awaiting feedback"
                    : "No recordings in this view"}
              </h3>
              <p>
                {query
                  ? "Try a learner’s name or another test title."
                  : "Submitted recordings appear here with their learner and version."}
              </p>
              {(query || filter !== "all") && (
                <button onClick={() => navigate({ q: "", queue: "all" })}>
                  Show all recordings
                </button>
              )}
            </div>
          )}
          {!testId && !loadError && (
            <section className="test-directory">
              <h2>{manage ? "Your assessments" : "Assigned assessments"}</h2>
              <p className="fine">
                Open a test to see its instructions and recordings.
              </p>
              {!loading && !data.tests.length && (
                <p className="ui-empty">
                  {manage
                    ? "Create your first test to give learners a focused practice goal."
                    : "You don’t have any assigned tests yet."}
                </p>
              )}
              <div className="test-cards">
                {data.tests.map((t) => (
                  <button
                    key={t.id}
                    className="test-card"
                    onClick={() =>
                      navigate({ test: t.id, review: "", action: "", form: "" })
                    }
                  >
                    <ClipboardCheck size={20} />
                    <strong>{text(t, "title")}</strong>
                    <small>Due {dateLabel(text(t, "due_at"), true)}</small>
                    <span>
                      {
                        data.submissions.filter((s) => s.assessment_id === t.id)
                          .length
                      }{" "}
                      submitted versions
                    </span>
                    <Badge tone={t.published ? "success" : "neutral"}>
                      {t.published ? "Published" : "Hidden"}
                    </Badge>
                  </button>
                ))}
              </div>
            </section>
          )}
          {canExport && (
            <WorkflowDetails className="task-disclosure review-export">
              <summary>Dataset export</summary>
              <p className="fine">
                Export only verified labels with the required learner reuse
                consent.
              </p>
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
            </WorkflowDetails>
          )}
        </>
      )}
    </>
  );
}
