import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { WorkflowForm } from "../../components/WorkflowForm";
import { WorkflowDetails } from "../../components/WorkflowDetails";
import { Badge, dateLabel } from "../../components/ui";
import { navigate, useRouteValue } from "../../routes";
import { text, num, today, Select, type Row, type SchoolTools } from "./common";

export type Roster = {
  learners: Row[];
  batches: Row[];
  enrollments: Row[];
  staff: Row[];
};

export function RosterView({ tools: t }: { tools: SchoolTools }) {
  const [data, setData] = useState<Roster>({
    learners: [],
    batches: [],
    enrollments: [],
    staff: [],
  });
  const [households, setHouseholds] = useState<Row[]>([]);
  const [batchId] = useRouteValue("batch");
  const [enrollmentId] = useRouteValue("enrollment");
  const [action] = useRouteValue("action");
  const [formId] = useRouteValue("form");
  const [query, setQuery] = useRouteValue("q");
  const [filter, setFilter] = useRouteValue("status", "active");
  const [learner, setLearner] = useState("");
  const [household, setHousehold] = useRouteValue("household");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const request = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const creating = action === "create-a-batch" || formId === "create-batch";
  const enrolling =
    action === "enroll-a-learner" || formId === "enroll-learner";
  async function load() {
    const id = ++request.current;
    setLoadError("");
    try {
      const [roster, families] = await Promise.all([
        t.read<Roster>("roster"),
        t.read<Row[]>("households"),
      ]);
      if (id === request.current) {
        setData(roster);
        setHouseholds(families);
      }
    } catch (e) {
      if (id === request.current) setLoadError((e as Error).message);
    } finally {
      if (id === request.current) setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    return () => {
      request.current++;
    };
  }, [t.read]);
  useEffect(() => {
    heading.current?.focus();
  }, [batchId, enrollmentId, creating, enrolling, loading]);
  const learners = [...new Map(data.learners.map((l) => [l.id, l])).values()];
  const batch = data.batches.find((b) => b.id === batchId);
  const enrollment = data.enrollments.find(
    (e) => e.id === enrollmentId && (!batchId || e.batch_id === batchId),
  );
  const activeCount = (id: string) =>
    data.enrollments.filter((e) => e.batch_id === id && e.status === "active")
      .length;
  const membershipHouseholds = households.filter((h) =>
    data.learners.some((l) => l.id === learner && l.household_id === h.id),
  );
  const batchMembers = data.enrollments.filter((e) => e.batch_id === batchId);
  const memberName = (e: Row) =>
    text(learners.find((l) => l.id === e.learner_id) || {}, "name") ||
    "Learner";
  const familyName = (e: Row) =>
    text(households.find((h) => h.id === e.household_id) || {}, "name") ||
    "Billing household unavailable";
  const eligibleLearners = learners.filter(
    (l) =>
      !batchMembers.some((e) => e.learner_id === l.id && e.status !== "ended"),
  );
  const shownMembers = batchMembers.filter(
    (e) =>
      (filter === "all" || e.status === filter) &&
      `${memberName(e)} ${familyName(e)}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const shownBatches = data.batches.filter((b) =>
    `${text(b, "name")} ${text(b, "course")}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const openBatch = (id: string) =>
    navigate({
      batch: id,
      enrollment: "",
      household: "",
      action: "",
      form: "",
      q: "",
      status: "",
    });
  const closeComposer = () => navigate({ action: "", form: "", household: "" });
  if (loading)
    return (
      <p role="status" className="ui-empty">
        Loading batches and learners…
      </p>
    );
  if (loadError)
    return (
      <div className="ui-empty" role="alert">
        <h2>We couldn’t load your batches</h2>
        <p>{loadError}</p>
        <button onClick={() => void load()}>Try again</button>
      </div>
    );

  if (creating)
    return (
      <section className="batch-composer">
        <button className="back-link" onClick={closeComposer}>
          <ArrowLeft size={16} />
          Back to batches
        </button>
        <div className="batch-page-heading">
          <div>
            <span className="eyebrow">Teaching group</span>
            <h2 ref={heading} tabIndex={-1}>
              Create a batch
            </h2>
            <p>Give learners a regular group to practise with.</p>
          </div>
        </div>
        <WorkflowForm
          className="form-grid"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget,
              f = new FormData(form);
            const result = await t.command<{ id: string }>("batch.create", {
              name: f.get("name"),
              course: f.get("course"),
              capacity: Number(f.get("capacity")),
            });
            if (result) {
              form.reset();
              await load();
              openBatch(result.id);
            }
          }}
        >
          <label className="wide">
            Batch name
            <input
              name="name"
              required
              minLength={2}
              maxLength={100}
              placeholder="Saturday beginners"
            />
          </label>
          <label>
            Course
            <input
              name="course"
              required
              maxLength={100}
              defaultValue="Carnatic vocal"
            />
          </label>
          <label>
            Capacity
            <input
              name="capacity"
              required
              type="number"
              min="1"
              max="500"
              defaultValue="10"
            />
          </label>
          <p className="fine wide">
            Capacity counts active enrolments. Class times and teacher
            assignments are set in Classes.
          </p>
          <div className="batch-form-footer wide">
            <button
              type="button"
              className="button secondary"
              onClick={closeComposer}
            >
              Cancel
            </button>
            <button className="button primary" disabled={t.busy}>
              Create batch
            </button>
          </div>
        </WorkflowForm>
      </section>
    );

  if (enrolling)
    return (
      <section className="batch-composer">
        <button className="back-link" onClick={closeComposer}>
          <ArrowLeft size={16} />
          Back to {batch ? "batch" : "batches"}
        </button>
        <div className="batch-page-heading">
          <div>
            <span className="eyebrow">Enrolment</span>
            <h2 ref={heading} tabIndex={-1}>
              Add a learner to a batch
            </h2>
            <p>
              Choose their teaching group and the family responsible for fees.
            </p>
          </div>
        </div>
        <WorkflowForm
          className="form-grid"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget,
              f = new FormData(form);
            const result = await t.command<{ id: string }>("learner.enroll", {
              learner,
              batch: batchId,
              household,
              starts: f.get("starts"),
            });
            if (result) {
              form.reset();
              setLearner("");
              await load();
              navigate({
                enrollment: result.id,
                action: "",
                form: "",
                household: "",
                q: "",
              });
            }
          }}
        >
          <Select
            label="Batch"
            value={batchId}
            onChange={(id) => {
              setLearner("");
              navigate({ batch: id, household: "" });
            }}
            rows={data.batches}
          />
          <Select
            label="Learner"
            value={learner}
            onChange={(id) => {
              setLearner(id);
              setHousehold(
                text(
                  data.learners.find((l) => l.id === id) || {},
                  "household_id",
                ),
              );
            }}
            rows={eligibleLearners}
          />
          <Select
            label="Billing household"
            value={household}
            onChange={setHousehold}
            rows={membershipHouseholds}
          />
          <label>
            Starts on
            <input name="starts" type="date" required defaultValue={today()} />
          </label>
          <p className="fine wide">
            Only this learner’s households are available for billing. Learners
            with an active or paused enrolment in this batch already have a
            record; open it to change their status.
          </p>
          {batch && activeCount(batch.id) >= num(batch, "capacity") && (
            <p className="wide alert" role="status">
              This batch is full. Choose another batch before enrolling.
            </p>
          )}
          {!learners.length && (
            <p className="wide">
              Add a learner in Households before enrolling them.
            </p>
          )}
          <div className="batch-form-footer wide">
            <button
              type="button"
              className="button secondary"
              onClick={closeComposer}
            >
              Cancel
            </button>
            <button
              className="button primary"
              disabled={
                t.busy ||
                !batch ||
                !learner ||
                !household ||
                activeCount(batch.id) >= num(batch, "capacity")
              }
            >
              Enroll learner
            </button>
          </div>
        </WorkflowForm>
      </section>
    );

  if (enrollmentId)
    return (
      <>
        <button
          className="back-link"
          onClick={() => navigate({ enrollment: "", action: "", form: "" })}
        >
          <ArrowLeft size={16} />
          Back to batch
        </button>
        {!enrollment ? (
          <div className="ui-empty" role="alert">
            This enrolment is not available.
          </div>
        ) : (
          <article
            className="enrollment-record"
            key={enrollment.id}
            data-route-resource={enrollment.id}
          >
            <div className="batch-page-heading">
              <div>
                <span className="eyebrow">Learner enrolment</span>
                <h2 ref={heading} tabIndex={-1}>
                  {memberName(enrollment)}
                </h2>
                <p>
                  {text(
                    data.batches.find((b) => b.id === enrollment.batch_id) ||
                      {},
                    "name",
                  )}
                </p>
              </div>
              <Badge
                tone={enrollment.status === "active" ? "success" : "neutral"}
              >
                {text(enrollment, "status")}
              </Badge>
            </div>
            <dl className="enrollment-facts">
              <div>
                <dt>Billing household</dt>
                <dd>{familyName(enrollment)}</dd>
              </div>
              <div>
                <dt>Started</dt>
                <dd>{dateLabel(text(enrollment, "starts_on"))}</dd>
              </div>
              {!!enrollment.ends_on && (
                <div>
                  <dt>Ended</dt>
                  <dd>{dateLabel(text(enrollment, "ends_on"))}</dd>
                </div>
              )}
            </dl>
            <WorkflowDetails
              className="task-disclosure"
              context={{
                enrollment: enrollment.id,
                batch: text(enrollment, "batch_id"),
              }}
            >
              <summary>Change enrolment status</summary>
              <p className="fine">
                Pause a break in learning or end this enrolment. Reactivating
                requires a place in the batch.
              </p>
              <WorkflowForm
                className="form-grid"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (
                    await t.command("enrollment.status", {
                      id: enrollment.id,
                      status: new FormData(e.currentTarget).get("status"),
                    })
                  ) {
                    await load();
                    navigate({ action: "", form: "" });
                  }
                }}
              >
                <label>
                  Status
                  <select
                    name="status"
                    defaultValue={text(enrollment, "status")}
                  >
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="ended">Ended</option>
                  </select>
                </label>
                <button className="button primary" disabled={t.busy}>
                  Save enrolment status
                </button>
              </WorkflowForm>
            </WorkflowDetails>
            {enrollment.status === "active" && (
              <WorkflowDetails
                className="task-disclosure"
                context={{
                  enrollment: enrollment.id,
                  batch: text(enrollment, "batch_id"),
                }}
              >
                <summary>Change future billing household</summary>
                <p className="billing-change-note">
                  This changes the billing household for{" "}
                  <strong>all active enrolments</strong> of{" "}
                  {memberName(enrollment)} and adds them to that household.
                  Existing charges and receipts stay with the original
                  household.
                </p>
                <WorkflowForm
                  className="form-grid"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (
                      await t.command("learner.transfer", {
                        learner: enrollment.learner_id,
                        household: new FormData(e.currentTarget).get(
                          "household",
                        ),
                      })
                    ) {
                      await load();
                      navigate({ action: "", form: "" });
                    }
                  }}
                >
                  <label>
                    Future billing household
                    <select
                      name="household"
                      defaultValue={text(enrollment, "household_id")}
                      required
                    >
                      {households.map((h) => (
                        <option key={h.id} value={h.id}>
                          {text(h, "name")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="button primary" disabled={t.busy}>
                    Update future billing
                  </button>
                </WorkflowForm>
              </WorkflowDetails>
            )}
          </article>
        )}
      </>
    );

  return (
    <>
      {batchId && (
        <button className="back-link" onClick={() => openBatch("")}>
          <ArrowLeft size={16} />
          All batches
        </button>
      )}
      {batchId && !batch ? (
        <div className="ui-empty" role="alert">
          This batch is not available.
        </div>
      ) : (
        <>
          <div className="batch-page-heading">
            <div>
              <span className="eyebrow">
                {batch ? text(batch, "course") : "Teaching groups"}
              </span>
              <h2 ref={heading} tabIndex={-1}>
                {batch ? text(batch, "name") : "Your batches"}
              </h2>
              <p>
                {batch
                  ? `${activeCount(batch.id)} active ${activeCount(batch.id) === 1 ? "learner" : "learners"} · ${Math.max(0, num(batch, "capacity") - activeCount(batch.id))} ${num(batch, "capacity") - activeCount(batch.id) === 1 ? "place" : "places"} available`
                  : "Find a teaching group, then manage its learners."}
              </p>
            </div>
            <button
              className="button primary"
              onClick={() => {
                setLearner("");
                navigate({
                  action: batch ? "enroll-a-learner" : "create-a-batch",
                  form: "",
                  household: "",
                });
              }}
            >
              <Plus size={16} />
              {batch ? "Add learner" : "Create a batch"}
            </button>
          </div>
          <div className="batch-list-toolbar">
            <label className="batch-search">
              <Search size={17} />
              <input
                aria-label={batch ? "Search batch learners" : "Search batches"}
                type="search"
                placeholder={
                  batch
                    ? "Find a learner or household"
                    : "Find a batch or course"
                }
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            {!batch && data.batches.length > 0 && (
              <button
                className="button secondary"
                onClick={() => {
                  setLearner("");
                  navigate({
                    action: "enroll-a-learner",
                    form: "",
                    household: "",
                  });
                }}
              >
                Enroll a learner
              </button>
            )}
          </div>
          {batch ? (
            <>
              <div
                className="segmented batch-status"
                aria-label="Enrolment status"
              >
                {["active", "paused", "ended", "all"].map((status) => (
                  <button
                    key={status}
                    aria-pressed={filter === status}
                    onClick={() => setFilter(status)}
                  >
                    {status === "all"
                      ? "All learners"
                      : status[0].toUpperCase() + status.slice(1)}{" "}
                    <span>
                      {
                        batchMembers.filter(
                          (e) => status === "all" || e.status === status,
                        ).length
                      }
                    </span>
                  </button>
                ))}
              </div>
              <div className="batch-member-list">
                {shownMembers.map((e) => (
                  <button
                    className="batch-member"
                    key={e.id}
                    onClick={() =>
                      navigate({ enrollment: e.id, action: "", form: "" })
                    }
                  >
                    <span className="batch-avatar" aria-hidden="true">
                      {memberName(e)
                        .split(" ")
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join("")}
                    </span>
                    <span className="batch-member-info">
                      <strong>{memberName(e)}</strong>
                      <small>
                        {familyName(e)} · Since{" "}
                        {dateLabel(text(e, "starts_on"))}
                      </small>
                    </span>
                    <Badge tone={e.status === "active" ? "success" : "neutral"}>
                      {text(e, "status")}
                    </Badge>
                    <ArrowUpRight size={17} aria-hidden="true" />
                  </button>
                ))}
              </div>
              {!shownMembers.length && (
                <div className="ui-empty">
                  <Users size={26} />
                  <h3>
                    {query
                      ? "No matching learners"
                      : batchMembers.length
                        ? `No ${filter === "all" ? "matching" : filter} enrolments`
                        : "Your first learner starts here"}
                  </h3>
                  <p>
                    {query
                      ? "Try a different name or clear your search."
                      : "Add a learner or change the status filter to see existing records."}
                  </p>
                  {query && (
                    <button onClick={() => setQuery("")}>Clear search</button>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="batch-directory">
                {shownBatches.map((b) => {
                  const count = activeCount(b.id),
                    capacity = num(b, "capacity");
                  return (
                    <button
                      className="batch-card"
                      key={b.id}
                      onClick={() => openBatch(b.id)}
                    >
                      <div className="batch-card-top">
                        <BookOpen size={22} />
                        <ArrowUpRight size={17} />
                      </div>
                      <strong>{text(b, "name")}</strong>
                      <p>{text(b, "course")}</p>
                      <div className="batch-capacity">
                        <span>
                          {count} / {capacity} active learners
                        </span>
                        <Badge
                          tone={count >= capacity ? "attention" : "neutral"}
                        >
                          {count >= capacity
                            ? "Full"
                            : `${capacity - count} places`}
                        </Badge>
                      </div>
                      <div className="batch-capacity-track" aria-hidden="true">
                        <span
                          style={{
                            width: `${Math.min(100, (count / capacity) * 100)}%`,
                          }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
              {!shownBatches.length && (
                <div className="ui-empty">
                  <BookOpen size={28} />
                  <h3>
                    {query
                      ? "No matching batches"
                      : "Create your first teaching group"}
                  </h3>
                  <p>
                    {query
                      ? "Try another batch name or course."
                      : "Start with a batch, then add learners and schedule classes."}
                  </p>
                  {query && (
                    <button onClick={() => setQuery("")}>Clear search</button>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
