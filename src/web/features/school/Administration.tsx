import PhoneInput from "../auth/PhoneInput";
import { useEffect, useState } from "react";
import { type Row, type SchoolTools, text, num, money, Select } from "./common";
import { csvExport } from "../../../core/csv";
export function MessagesView({ tools }: { tools: SchoolTools }) {
  const [households, setHouseholds] = useState<Row[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [announcementKey, setAnnouncementKey] = useState(crypto.randomUUID());
  const [messages, setMessages] = useState<Row[]>([]),
    [preview, setPreview] = useState<{ url: string; message: string } | null>(
      null,
    );
  const load = () =>
    tools
      .read<Row[]>("messages")
      .then(setMessages)
      .catch((e) => tools.setError(e.message));
  useEffect(() => {
    void load();
    tools
      .read<Row[]>("households")
      .then(setHouseholds)
      .catch((e) => tools.setError(e.message));
  }, [tools.read]);
  return (
    <>
      <h2>Communications</h2>
      <p>
        One routed notice per household. Preview before sharing; a WhatsApp link
        does not confirm delivery.
      </p>
      <details>
        <summary>Send a household announcement or event invitation</summary>
        <form
          className="form-grid"
          onSubmit={async (e) => {
            e.preventDefault();
            const message = new FormData(e.currentTarget).get("message");
            if (
              await tools.command("message.announce", {
                households: selected,
                message,
                key: announcementKey,
              })
            ) {
              setAnnouncementKey(crypto.randomUUID());
              void load();
            }
          }}
        >
          <label className="wide">
            Announcement
            <textarea name="message" required maxLength={3000} />
          </label>
          <div className="member-picker wide">
            {households
              .filter((h) => !h.archived_at)
              .map((h) => (
                <label key={h.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(h.id)}
                    onChange={(e) =>
                      setSelected((v) =>
                        e.target.checked
                          ? [...v, h.id]
                          : v.filter((id) => id !== h.id),
                      )
                    }
                  />
                  {text(h, "name")}
                </label>
              ))}
          </div>
          <button>Queue one notice per selected household</button>
        </form>
      </details>
      <button
        onClick={async () => {
          await tools.command("messages.refresh", {});
          void load();
        }}
      >
        Refresh current reminders
      </button>
      {preview && (
        <article className="record-card">
          <p>{preview.message}</p>
          <a href={preview.url} target="_blank" rel="noreferrer">
            Open WhatsApp with this message
          </a>
        </article>
      )}
      {messages.map((m) => (
        <article key={m.id} className="record-card">
          <h3>
            {text(m, "kind")} · {text(m, "status")}
          </h3>
          <p>
            {text(m, "destination")} ·{" "}
            {new Date(text(m, "due_at")).toLocaleString("en-IN", {
              timeZone: "Asia/Kolkata",
            })}{" "}
            IST
          </p>
          <p>{text(m, "message")}</p>
          <small>{text(m, "error")}</small>
          {["queued", "manual", "failed"].includes(text(m, "status")) && (
            <button
              onClick={async () => {
                const p = await tools.command<{
                  url?: string;
                  message?: string;
                  cancelled?: boolean;
                }>("message.manual", { id: m.id });
                if (p?.url)
                  setPreview({ url: p.url, message: p.message || "" });
                else setPreview(null);
                void load();
              }}
            >
              Check recipient and preview
            </button>
          )}
          {m.status === "failed" && (
            <button
              onClick={async () => {
                await tools.command("message.retry", { id: m.id });
                void load();
              }}
            >
              Retry failed notice
            </button>
          )}
          {m.status === "unknown" && (
            <form
              className="form-grid"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                await tools.command("message.reconcile", {
                  id: m.id,
                  status: f.get("status"),
                  reason: f.get("reason"),
                  providerId: String(f.get("providerId")) || undefined,
                });
                void load();
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
                <input name="providerId" />
              </label>
              <label>
                Evidence / reason
                <input name="reason" required minLength={3} />
              </label>
              <button>Reconcile outcome</button>
            </form>
          )}
        </article>
      ))}
    </>
  );
}
export function ReportsView({ tools }: { tools: SchoolTools }) {
  const [data, setData] = useState<Record<string, Row[]>>({});
  useEffect(() => {
    tools
      .read<typeof data>("reports")
      .then(setData)
      .catch((e) => tools.setError(e.message));
  }, [tools.read]);
  return (
    <>
      <h2>School reports</h2>
      <p>
        Outstanding fees{" "}
        {money((data.collections || []).reduce((n, c) => n + num(c, "due"), 0))}{" "}
        · open follow-ups {(data.tasks || []).length} · delivery failures{" "}
        {(data.failures || []).length}
      </p>
      {[
        ["attendance", "Attendance"],
        ["learning", "Learning and reviews"],
        ["collections", "Collections"],
        ["tasks", "Follow-ups"],
        ["failures", "Communication failures"],
      ].map(([key, title]) => (
        <section key={key}>
          <h3>{title}</h3>
          <button
            onClick={() => {
              const rows = data[key] || [];
              tools.download(
                key + ".csv",
                csvExport([
                  rows.length ? Object.keys(rows[0]) : [],
                  ...rows.map((r) =>
                    Object.values(r).map((v) =>
                      typeof v === "object"
                        ? JSON.stringify(v)
                        : String(v ?? ""),
                    ),
                  ),
                ]),
              );
            }}
          >
            Export {title.toLowerCase()}
          </button>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {(key === "attendance"
                    ? ["Learner", "Present", "Marked"]
                    : key === "learning"
                      ? ["Learner", "Submissions", "Reviewed"]
                      : key === "collections"
                        ? ["Learner", "Charge", "Due"]
                        : key === "tasks"
                          ? ["Household", "Task", "Due"]
                          : ["Recipient", "Kind", "Status"]
                  ).map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data[key] || []).map((r, i) => (
                  <tr key={r.id || i}>
                    {(key === "attendance"
                      ? [text(r, "name"), num(r, "present"), num(r, "marked")]
                      : key === "learning"
                        ? [
                            text(r, "name"),
                            num(r, "submissions"),
                            num(r, "reviewed"),
                          ]
                        : key === "collections"
                          ? [
                              text(r, "learner_name"),
                              text(r, "description"),
                              money(num(r, "due")),
                            ]
                          : key === "tasks"
                            ? [
                                text(r, "household"),
                                text(r, "title"),
                                text(r, "due_on").slice(0, 10),
                              ]
                            : [
                                text(r, "destination"),
                                text(r, "kind"),
                                text(r, "status"),
                              ]
                    ).map((v, j) => (
                      <td key={j}>{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  );
}
export function AccessView({ tools }: { tools: SchoolTools }) {
  const [data, setData] = useState<{ grants: Row[]; invitations: Row[] }>({
      grants: [],
      invitations: [],
    }),
    [roster, setRoster] = useState<{ batches: Row[]; learners: Row[] }>({
      batches: [],
      learners: [],
    }),
    [households, setHouseholds] = useState<Row[]>([]),
    [tests, setTests] = useState<Row[]>([]),
    [cap, setCap] = useState("classes.teach"),
    [channel, setChannel] = useState("email"),
    [resource, setResource] = useState("");
  const load = () =>
    tools
      .read<typeof data>("grants")
      .then(setData)
      .catch((e) => tools.setError(e.message));
  useEffect(() => {
    void load();
    tools
      .read<typeof roster>("roster")
      .then(setRoster)
      .catch((e) => tools.setError(e.message));
    tools
      .read<Row[]>("households")
      .then(setHouseholds)
      .catch((e) => tools.setError(e.message));
    tools
      .read<{ tests: Row[] }>("tests")
      .then((d) => setTests(d.tests))
      .catch((e) => tools.setError(e.message));
  }, [tools.read]);
  const rows =
    cap === "classes.teach"
      ? roster.batches
      : cap === "portal.learn"
        ? roster.learners
        : cap === "household.billing"
          ? households
          : cap === "assessments.review"
            ? tests
            : [{ id: tools.school.id, name: tools.school.name }];
  return (
    <>
      <h2>Team, learner and guardian access</h2>
      <p>
        Invitations match a verified login identity and expire in seven days.
        Grant household billing separately from learner access.
      </p>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          if (
            await tools.command("grant.invite", {
              channel: f.get("channel"),
              destination: f.get("destination"),
              capability: cap,
              resource,
            })
          )
            void load();
        }}
      >
        <label>
          Sign-in method
          <select
            name="channel"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
          >
            <option value="email">Google email</option>
            <option value="phone">Phone OTP</option>
          </select>
        </label>
        {channel === "phone" ? (
          <PhoneInput label="Verified phone" name="destination" required />
        ) : (
          <label>
            Verified email
            <input name="destination" type="email" required />
          </label>
        )}
        <label>
          Permission
          <select
            value={cap}
            onChange={(e) => {
              setCap(e.target.value);
              setResource("");
            }}
          >
            <option value="classes.teach">Teach assigned batch</option>
            <option value="assessments.review">Review assigned test</option>
            <option value="portal.learn">Learner / guardian portal</option>
            <option value="household.billing">
              Household statement and payments
            </option>
            <option value="finance.manage">School finance operator</option>
          </select>
        </label>
        <Select
          label="Scope"
          rows={rows}
          labelKey={cap === "assessments.review" ? "title" : "name"}
          value={resource}
          onChange={setResource}
        />
        <button>Create access invitation</button>
      </form>
      {data.invitations.map((i) => (
        <p key={i.id}>
          {text(i, "destination")} · {text(i, "capability")} ·{" "}
          {text(i, "resource_id")} · expires {text(i, "expires_at")}{" "}
          <button
            onClick={async () => {
              await tools.command("grant.revoke", {
                id: i.id,
                invitation: true,
              });
              void load();
            }}
          >
            Revoke invitation
          </button>
        </p>
      ))}
      {data.grants.map((g) => (
        <p key={g.id}>
          {text(g, "display_name")} · {text(g, "capability")} ·{" "}
          {text(g, "resource_id")}{" "}
          <button
            onClick={async () => {
              await tools.command("grant.revoke", { id: g.id });
              void load();
            }}
          >
            Revoke access
          </button>
        </p>
      ))}
    </>
  );
}
export function IntegrationsView({ tools }: { tools: SchoolTools }) {
  const [data, setData] = useState<{
      settings: Row;
      whatsappConfigured: boolean;
      paymentsConfigured: boolean;
    } | null>(null),
    [links, setLinks] = useState<Row[]>([]),
    [houses, setHouses] = useState<Row[]>([]),
    [household, setHousehold] = useState(""),
    [charges, setCharges] = useState<Row[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [key, setKey] = useState(crypto.randomUUID());
  const load = () => {
    tools
      .read<typeof data>("integrations")
      .then(setData)
      .catch((e) => tools.setError(e.message));
    tools
      .read<Row[]>("payment-links")
      .then(setLinks)
      .catch((e) => tools.setError(e.message));
  };
  useEffect(() => {
    load();
    tools
      .read<Row[]>("households")
      .then(setHouses)
      .catch((e) => tools.setError(e.message));
  }, [tools.read]);
  useEffect(() => {
    if (household)
      tools
        .read<{ charges: Row[] }>("statement", "?id=" + household)
        .then((d) => {
          setCharges(d.charges.filter((c) => num(c, "due") > 0));
          setSelected([]);
          setKey(crypto.randomUUID());
        })
        .catch((e) => tools.setError(e.message));
  }, [household]);
  if (!data) return <p>Loading integrations…</p>;
  return (
    <>
      <h2>Integrations and automation</h2>
      <p>
        WhatsApp credentials:{" "}
        {data.whatsappConfigured ? "configured" : "not configured"} · Razorpay
        credentials: {data.paymentsConfigured ? "configured" : "not configured"}
      </p>
      <p>
        Configure secrets on the server. Automatic delivery also requires an
        approved WhatsApp template and a running worker.
      </p>
      <form
        key={JSON.stringify(data.settings)}
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          await tools.command("integrations.update", {
            enabled: f.get("enabled") === "on",
            phoneId: String(f.get("phoneId")) || undefined,
            template: String(f.get("template")) || undefined,
            language: f.get("language"),
            dailyLimit: Number(f.get("limit")),
          });
          load();
        }}
      >
        <label>
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={!!data.settings.automated_messages}
          />{" "}
          Enable automatic WhatsApp messages
        </label>
        <label>
          WhatsApp sender phone ID
          <input
            name="phoneId"
            defaultValue={text(data.settings, "whatsapp_phone_id")}
          />
        </label>
        <label>
          Approved template name
          <input
            name="template"
            defaultValue={text(data.settings, "whatsapp_template")}
          />
        </label>
        <label>
          Language code
          <input
            name="language"
            defaultValue={text(data.settings, "whatsapp_language") || "en"}
          />
        </label>
        <label>
          Maximum sends per day
          <input
            type="number"
            min="1"
            max="10000"
            name="limit"
            defaultValue={num(data.settings, "daily_message_limit") || 200}
          />
        </label>
        <button>Save automation settings</button>
      </form>
      <h3>Payment links</h3>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await tools.command("payment-link.create", {
              household,
              charges: selected,
              key,
            })
          ) {
            setKey(crypto.randomUUID());
            load();
          }
        }}
      >
        <Select
          label="Household"
          rows={houses}
          value={household}
          onChange={setHousehold}
        />
        <div>
          {charges.map((c) => (
            <label key={c.id}>
              <input
                type="checkbox"
                checked={selected.includes(c.id)}
                onChange={(e) =>
                  setSelected((v) =>
                    e.target.checked
                      ? [...v, c.id]
                      : v.filter((i) => i !== c.id),
                  )
                }
              />
              {text(c, "description")} · {money(num(c, "due"))}
            </label>
          ))}
        </div>
        <button disabled={!data.paymentsConfigured || !selected.length}>
          Create Razorpay payment link
        </button>
      </form>
      {links.map((l) => (
        <article className="record-card" key={l.id}>
          <p>
            {money(num(l, "amount"))} · {text(l, "status")}{" "}
            {!!l.url && (
              <a href={text(l, "url")} target="_blank" rel="noreferrer">
                Payment link
              </a>
            )}
          </p>
          {["unknown", "creating"].includes(text(l, "status")) && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await tools.command("payment-link.reconcile", {
                  id: l.id,
                  providerId: new FormData(e.currentTarget).get("provider"),
                });
                load();
              }}
            >
              <label>
                Provider payment-link ID
                <input name="provider" required placeholder="plink_…" />
              </label>
              <button>Reconcile with provider</button>
            </form>
          )}
        </article>
      ))}
    </>
  );
}
