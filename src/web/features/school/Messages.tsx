import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import { WorkflowForm } from "../../components/WorkflowForm";
import { Badge, dateLabel } from "../../components/ui";
import { navigate, useRouteValue } from "../../routes";
import { text, num, type Row, type SchoolTools } from "./common";

const kinds: Record<string, string> = {
  class: "Class reminder",
  fee: "Fee reminder",
  test: "Test reminder",
  feedback: "Scorecard ready",
  event: "Event reminder",
  announcement: "School announcement",
};
const statuses: Record<string, string> = {
  queued: "Queued",
  manual: "Manual sharing",
  sending: "Sending",
  sent: "Sent",
  delivered: "Delivered",
  failed: "Failed",
  unknown: "Needs reconciliation",
  cancelled: "Cancelled",
  opted_out: "Opted out",
};
const explanations: Record<string, string> = {
  queued:
    "Waiting for processing. Current contact details and eligibility are checked before dispatch.",
  manual:
    "Prepared for manual sharing. Opening WhatsApp does not confirm sending or delivery.",
  sending:
    "A provider attempt is in progress. Wait for its outcome before taking another action.",
  sent: "The provider or a recorded reconciliation confirms sending. This does not confirm delivery or reading.",
  delivered: "The provider has confirmed delivery.",
  failed: "The last attempt failed. Check the reason before retrying.",
  unknown:
    "The outcome is uncertain. Check the provider before reconciling; do not resend blindly.",
  cancelled:
    "This notice is no longer eligible or was cancelled. It will not be sent.",
  opted_out: "This recipient has opted out. This notice will not be sent.",
};
const tone = (status: string) =>
  ["failed", "unknown"].includes(status)
    ? ("attention" as const)
    : ["sent", "delivered"].includes(status)
      ? ("success" as const)
      : ("neutral" as const);
export function MessagesView({ tools }: { tools: SchoolTools }) {
  const [messages, setMessages] = useState<Row[]>([]),
    [households, setHouseholds] = useState<Row[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [filter, setFilter] = useRouteValue("status", "ready"),
    [query, setQuery] = useRouteValue("q"),
    [messageId] = useRouteValue("message"),
    [action] = useRouteValue("action"),
    [form] = useRouteValue("form");
  const [preview, setPreview] = useState<{
      id: string;
      url: string;
      message: string;
    } | null>(null),
    [previewNotice, setPreviewNotice] = useState("");
  const [selected, setSelected] = useState<string[]>([]),
    [draft, setDraft] = useState(""),
    [recipientQuery, setRecipientQuery] = useState(""),
    [stage, setStage] = useState<"compose" | "review">("compose"),
    [key, setKey] = useState(crypto.randomUUID());
  const request = useRef(0),
    heading = useRef<HTMLHeadingElement>(null);
  const composing =
    action === "send-a-household-announcement-or-event-invitation" ||
    [
      "queue-one-notice-per-selected-household",
      "review-announcement",
      "queue-notices",
    ].includes(form);
  async function load() {
    const id = ++request.current;
    setError("");
    try {
      const [notices, families] = await Promise.all([
        tools.read<Row[]>("messages"),
        tools.read<Row[]>("households"),
      ]);
      if (id === request.current) {
        setMessages(notices);
        setHouseholds(families);
        setPreview((previous) =>
          previous &&
          notices.some(
            (notice) => notice.id === previous.id && notice.status === "manual",
          )
            ? previous
            : null,
        );
      }
    } catch (e) {
      if (id === request.current) setError((e as Error).message);
    } finally {
      if (id === request.current) setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    return () => {
      request.current++;
    };
  }, [tools.read]);
  useEffect(() => {
    setPreview(null);
    setPreviewNotice("");
    heading.current?.focus();
  }, [messageId, composing, loading, stage]);
  const belongs = (m: Row, f: string) =>
    f === "all" ||
    (f === "attention"
      ? ["failed", "unknown"].includes(text(m, "status"))
      : f === "ready"
        ? ["queued", "manual", "sending"].includes(text(m, "status"))
        : f === "sent"
          ? ["sent", "delivered"].includes(text(m, "status"))
          : ["cancelled", "opted_out"].includes(text(m, "status")));
  const family = (m: Row) =>
    text(households.find((h) => h.id === m.household_id) || {}, "name") ||
    text(m, "destination");
  const shown = messages.filter(
    (m) =>
      belongs(m, filter) &&
      `${family(m)} ${text(m, "destination")} ${text(m, "message")} ${kinds[text(m, "kind")] || text(m, "kind")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const current = messages.find((m) => m.id === messageId);
  const activeHouseholds = households.filter((h) => !h.archived_at);
  const close = () => {
    tools.setError("");
    navigate({ message: "", action: "", form: "" });
  };
  if (loading)
    return (
      <p className="ui-empty" role="status">
        Loading school communications…
      </p>
    );
  if (error)
    return (
      <div role="alert" className="ui-empty">
        <h2>We couldn’t load your messages</h2>
        <p>{error}</p>
        <button onClick={() => void load()}>Try again</button>
      </div>
    );
  if (composing)
    return (
      <section className="message-composer">
        <button className="back-link" onClick={close}>
          <ArrowLeft size={16} />
          Back to messages
        </button>
        <div className="message-heading">
          <div>
            <span className="eyebrow">Household announcement</span>
            <h2 ref={heading} tabIndex={-1}>
              {stage === "review"
                ? "Review your announcement"
                : "Keep families in the loop"}
            </h2>
            <p>
              {stage === "review"
                ? "Check the message and selected households before queuing."
                : "Write once, then choose the families who need to hear it."}
            </p>
          </div>
        </div>
        <WorkflowForm
          className="announcement-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (stage === "compose") {
              setStage("review");
              return;
            }
            if (
              await tools.command("message.announce", {
                households: selected,
                message: draft,
                key,
              })
            ) {
              setKey(crypto.randomUUID());
              setSelected([]);
              setDraft("");
              setRecipientQuery("");
              setStage("compose");
              await load();
              navigate({
                message: "",
                action: "",
                form: "",
                status: "ready",
                q: "",
              });
            }
          }}
        >
          {stage === "compose" ? (
            <>
              <label>
                Announcement
                <textarea
                  name="message"
                  rows={5}
                  required
                  maxLength={3000}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Share event details, a school update or an important date."
                />
              </label>
              <div className="recipient-heading">
                <h3>Choose households</h3>
                <Badge>{selected.length} selected</Badge>
              </div>
              <label className="message-search">
                <Search size={16} />
                <input
                  type="search"
                  aria-label="Find announcement recipients"
                  placeholder="Search families or contacts"
                  value={recipientQuery}
                  onChange={(e) => setRecipientQuery(e.target.value)}
                />
              </label>
              <div className="announcement-recipients">
                {activeHouseholds
                  .filter((h) =>
                    `${text(h, "name")} ${text(h, "contact_name")}`
                      .toLowerCase()
                      .includes(recipientQuery.toLowerCase()),
                  )
                  .map((h) => (
                    <label key={h.id}>
                      <input
                        type="checkbox"
                        checked={selected.includes(h.id)}
                        disabled={!h.phone}
                        onChange={(e) =>
                          setSelected((s) =>
                            e.target.checked
                              ? [...s, h.id]
                              : s.filter((id) => id !== h.id),
                          )
                        }
                      />
                      <span>
                        <strong>{text(h, "name")}</strong>
                        <small>
                          {text(h, "contact_name")} ·{" "}
                          {text(h, "phone") || "No WhatsApp number"}
                        </small>
                      </span>
                    </label>
                  ))}
                {!activeHouseholds.some((h) =>
                  `${text(h, "name")} ${text(h, "contact_name")}`
                    .toLowerCase()
                    .includes(recipientQuery.toLowerCase()),
                ) && (
                  <p className="ui-empty">
                    No matching households. Try another name.
                  </p>
                )}
              </div>
              <p className="fine">
                Households without a phone cannot receive WhatsApp notices.
                Recipient preferences and current contact details are rechecked
                before dispatch.
              </p>
            </>
          ) : (
            <>
              <div className="message-preview-bubble">
                <span className="eyebrow">Message preview</span>
                <p>{draft}</p>
              </div>
              <h3>
                {selected.length} selected{" "}
                {selected.length === 1 ? "household" : "households"}
              </h3>
              <ul className="announcement-review-list">
                {activeHouseholds
                  .filter((h) => selected.includes(h.id))
                  .map((h) => (
                    <li key={h.id}>
                      <Users size={16} />
                      <div>
                        <strong>{text(h, "name")}</strong>
                        <small>
                          {text(h, "contact_name")} · {text(h, "phone")}
                        </small>
                      </div>
                    </li>
                  ))}
              </ul>
              <p className="fine">
                Queuing creates notices for processing. Actual eligibility and
                delivery are shown in the message queue. Automated sending
                depends on the configured provider and worker.
              </p>
            </>
          )}
          <div className="message-form-footer">
            <button
              type="button"
              className="button secondary"
              onClick={() =>
                stage === "review" ? setStage("compose") : close()
              }
            >
              {stage === "review" ? "Edit announcement" : "Cancel"}
            </button>
            <button
              className="button primary"
              disabled={tools.busy || !selected.length || !draft.trim()}
            >
              {stage === "review" ? "Queue notices" : "Review announcement"}
            </button>
          </div>
        </WorkflowForm>
      </section>
    );
  if (messageId)
    return (
      <>
        <button className="back-link" onClick={close}>
          <ArrowLeft size={16} />
          Back to messages
        </button>
        {!current ? (
          <p className="ui-empty" role="alert">
            This notice is not available in the recent message queue.
          </p>
        ) : (
          <article className="message-record" data-route-resource={current.id}>
            <div className="message-heading">
              <div>
                <span className="eyebrow">
                  {kinds[text(current, "kind")] || text(current, "kind")}
                </span>
                <h2 ref={heading} tabIndex={-1}>
                  {family(current)}
                </h2>
                <p>{text(current, "destination")}</p>
              </div>
              <Badge tone={tone(text(current, "status"))}>
                {statuses[text(current, "status")] || text(current, "status")}
              </Badge>
            </div>
            <div className="message-status-note">
              <strong>
                {statuses[text(current, "status")] || text(current, "status")}
              </strong>
              <p>
                {explanations[text(current, "status")] ||
                  "Review this notice’s current outcome before taking action."}
              </p>
              <small>
                Scheduled {dateLabel(text(current, "due_at"), true)} ·{" "}
                {num(current, "attempts")} provider{" "}
                {num(current, "attempts") === 1 ? "attempt" : "attempts"}
              </small>
              {!!current.error && (
                <p className="message-error">{text(current, "error")}</p>
              )}
            </div>
            <div className="message-preview-bubble">
              <span className="eyebrow">Message content</span>
              <p>
                {preview?.id === current.id
                  ? preview.message
                  : text(current, "message")}
              </p>
            </div>
            {["queued", "manual", "failed"].includes(
              text(current, "status"),
            ) && (
              <button
                className="button primary"
                disabled={tools.busy}
                onClick={async () => {
                  setPreview(null);
                  setPreviewNotice("");
                  const p = await tools.command<{
                    url?: string;
                    message?: string;
                    cancelled?: boolean;
                  }>("message.manual", { id: current.id });
                  if (p?.url)
                    setPreview({
                      id: current.id,
                      url: p.url,
                      message: p.message || "",
                    });
                  else if (p?.cancelled)
                    setPreviewNotice(
                      "This notice is no longer eligible. It was cancelled after checking the current records.",
                    );
                  await load();
                }}
              >
                Check recipient and preview
              </button>
            )}
            {previewNotice && (
              <p role="status" className="message-status-note">
                {previewNotice}
              </p>
            )}
            {preview?.id === current.id && (
              <div className="manual-share-ready">
                <p>
                  Recipient checked. Review the text above before opening
                  WhatsApp.
                </p>
                <a
                  className="button primary"
                  href={preview.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open WhatsApp with this message
                  <ArrowUpRight size={15} />
                </a>
                <small>
                  Opening the link does not mark the notice as delivered.
                </small>
              </div>
            )}
            {current.status === "failed" && (
              <div className="message-recovery">
                <h3>Retry the failed attempt</h3>
                <p>
                  Retry only after correcting the failure. Eligibility will be
                  checked again.
                </p>
                <button
                  className="button secondary"
                  disabled={tools.busy || num(current, "attempts") >= 5}
                  onClick={async () => {
                    if (
                      await tools.command("message.retry", { id: current.id })
                    ) {
                      setPreview(null);
                      await load();
                    }
                  }}
                >
                  Retry failed notice
                </button>
                {num(current, "attempts") >= 5 && (
                  <p className="fine">
                    The retry limit has been reached. Follow up with the family
                    through the office.
                  </p>
                )}
              </div>
            )}
            {current.status === "unknown" && (
              <section className="message-recovery">
                <h3>Reconcile the provider outcome</h3>
                <p>
                  Record the confirmed outcome and the evidence used to resolve
                  it.
                </p>
                <WorkflowForm
                  className="form-grid"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    if (
                      await tools.command("message.reconcile", {
                        id: current.id,
                        status: f.get("status"),
                        reason: f.get("reason"),
                        providerId: String(f.get("providerId")) || undefined,
                      })
                    ) {
                      await load();
                      navigate({ form: "", action: "" });
                      heading.current?.focus();
                    }
                  }}
                >
                  <label>
                    Confirmed outcome
                    <select name="status">
                      <option value="cancelled">Do not resend</option>
                      <option value="sent">Provider confirmed sent</option>
                    </select>
                  </label>
                  <label>
                    Provider message ID
                    <input name="providerId" maxLength={200} />
                  </label>
                  <label className="wide">
                    Evidence / reason
                    <textarea
                      name="reason"
                      required
                      minLength={3}
                      maxLength={500}
                    />
                  </label>
                  <button className="button primary" disabled={tools.busy}>
                    Reconcile outcome
                  </button>
                </WorkflowForm>
              </section>
            )}
          </article>
        )}
      </>
    );
  return (
    <>
      <div className="message-heading">
        <div>
          <span className="eyebrow">School communications</span>
          <h2 ref={heading} tabIndex={-1}>
            Every notice, accounted for
          </h2>
          <p>
            Find what needs attention, preview a message and check its outcome.
          </p>
        </div>
        <button
          className="button primary"
          onClick={() => {
            setStage("compose");
            navigate({
              action: "send-a-household-announcement-or-event-invitation",
              form: "",
            });
          }}
        >
          <Plus size={16} />
          New announcement
        </button>
      </div>
      <div className="message-queue-tools">
        <div className="segmented message-filters" aria-label="Message status">
          {[
            ["ready", "Ready & processing"],
            ["attention", "Needs attention"],
            ["sent", "Sent & delivered"],
            ["closed", "Closed"],
            ["all", "All"],
          ].map(([id, label]) => (
            <button
              key={id}
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
            >
              {label}{" "}
              <span>{messages.filter((m) => belongs(m, id)).length}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="message-list-toolbar">
        <label className="message-search">
          <Search size={17} />
          <input
            type="search"
            aria-label="Search messages"
            placeholder="Find a family, recipient or message"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button
          className="button secondary"
          disabled={tools.busy}
          onClick={async () => {
            if (await tools.command("messages.refresh", {})) await load();
          }}
        >
          <RefreshCw size={15} />
          Refresh current reminders
        </button>
      </div>
      <div className="message-list">
        {shown.map((m) => (
          <button
            className="message-row"
            key={m.id}
            onClick={() => navigate({ message: m.id, action: "", form: "" })}
          >
            <span className="message-row-icon">
              <MessageCircle size={19} />
            </span>
            <span className="message-row-content">
              <strong>{family(m)}</strong>
              <span>
                {kinds[text(m, "kind")] || text(m, "kind")} ·{" "}
                {text(m, "message")}
              </span>
              <small>
                {text(m, "destination")} · {dateLabel(text(m, "due_at"), true)}
              </small>
            </span>
            <Badge tone={tone(text(m, "status"))}>
              {statuses[text(m, "status")] || text(m, "status")}
            </Badge>
            <ArrowUpRight size={17} />
          </button>
        ))}
      </div>
      {!shown.length && (
        <div className="ui-empty">
          <MessageCircle size={28} />
          <h3>
            {query
              ? "No matching messages"
              : messages.length
                ? "Nothing in this view"
                : "Your communication queue is clear"}
          </h3>
          <p>
            {query
              ? "Try a family name, phone number or part of the message."
              : "Choose another status, create an announcement, or refresh eligible reminders."}
          </p>
          {query && <button onClick={() => setQuery("")}>Clear search</button>}
        </div>
      )}
      <p className="fine message-queue-note">
        Showing recent notices (up to 500). Manual sharing does not confirm
        delivery. Class-specific reminders name the relevant learner; common
        announcements use household contact routing.
      </p>
    </>
  );
}
