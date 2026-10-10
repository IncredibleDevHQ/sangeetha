import "./Integrations.css";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  CreditCard,
  MessageCircle,
  Plus,
  RefreshCw,
} from "lucide-react";
import { WorkflowForm } from "../../components/WorkflowForm";
import { Badge, BackLink, dateLabel, statusLabel } from "../../components/ui";
import { PageActions, focusPageHeading } from "../../components/PageHeader";
import { navigate, useRouteValue } from "../../routes";
import { Select, text, num, money, type Row, type SchoolTools } from "./common";
type Settings = {
  settings: Row;
  whatsappConfigured: boolean;
  paymentsConfigured: boolean;
};

export function IntegrationsView({ tools }: { tools: SchoolTools }) {
  const [data, setData] = useState<Settings | null>(null),
    [links, setLinks] = useState<Row[]>([]),
    [houses, setHouses] = useState<Row[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const [integration] = useRouteValue("integration"),
    [action] = useRouteValue("action"),
    [form] = useRouteValue("form"),
    [link] = useRouteValue("link");
  const request = useRef(0),
    heading = useRef<HTMLHeadingElement>(null);
  const creating =
    action === "create-payment-link" || form === "create-razorpay-payment-link";
  const mode =
    integration ||
    (form === "save-automation-settings"
      ? "whatsapp"
      : creating || link || form.startsWith("reconcile-with-provider")
        ? "payments"
        : "");
  async function load() {
    const version = ++request.current;
    setLoading(true);
    setError("");
    try {
      const [settings, paymentLinks, households] = await Promise.all([
        tools.read<Settings>("integrations"),
        tools.read<Row[]>("payment-links"),
        tools.read<Row[]>("households"),
      ]);
      if (version === request.current) {
        setData(settings);
        setLinks(paymentLinks);
        setHouses(households);
      }
    } catch (e) {
      if (version === request.current) setError((e as Error).message);
    } finally {
      if (version === request.current) setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    return () => {
      request.current++;
    };
  }, [tools.read]);
  useEffect(() => {
    if (loading) return;
    if (heading.current) heading.current.focus();
    else focusPageHeading();
  }, [mode, link, creating, loading]);
  if (error)
    return (
      <div className="ui-empty" role="alert">
        <h2>We couldn’t load integrations</h2>
        <p>{error}</p>
        <button onClick={() => void load()}>Try again</button>
      </div>
    );
  if (!data)
    return (
      <p className="ui-empty" role="status">
        Checking integration settings…
      </p>
    );
  const selected = links.find((l) => l.id === link);
  const family = (id: string) =>
    text(houses.find((h) => h.id === id) || {}, "name") || "Household";
  return (
    <section className="integration-workspace" aria-busy={loading}>
      <PageActions>
        <button
          className="button secondary"
          disabled={loading}
          onClick={() => void load()}
        >
          <RefreshCw size={15} aria-hidden="true" />
          {loading ? "Checking…" : "Check status"}
        </button>
      </PageActions>
      {mode && (
        <>
          <BackLink
            onClick={() =>
              navigate({
                integration: "",
                link: "",
                action: "",
                form: "",
                household: "",
              })
            }
          >
            All integrations
          </BackLink>
          <div className="integration-heading">
            <div>
              <h2 ref={heading} tabIndex={-1}>
                {mode === "whatsapp" ? "WhatsApp delivery" : "Payment links"}
              </h2>
              <p>
                {mode === "whatsapp"
                  ? "Choose which school notices go out on WhatsApp."
                  : "Send a family one link for the charges you choose, then follow it to payment."}
              </p>
            </div>
          </div>
        </>
      )}
      {!mode ? (
        <>
          <div className="integration-directory">
            <button
              className="button integration-card"
              onClick={() => navigate({ integration: "whatsapp" })}
            >
              <span className="integration-icon">
                <MessageCircle size={24} />
              </span>
              <h3>WhatsApp</h3>
              <Badge tone="neutral">
                {data.whatsappConfigured
                  ? "Configuration detected"
                  : "Needs setup"}
              </Badge>
              <p>
                Class, fee, test and event reminders, scorecard notifications
                and school announcements.
              </p>
              <span className="integration-card-state">
                {data.settings.automated_messages
                  ? "Automatic delivery enabled"
                  : "Manual sharing available"}
              </span>
              <strong>
                Manage delivery <ChevronRight size={15} aria-hidden="true" />
              </strong>
            </button>
            <button
              className="button integration-card"
              onClick={() => navigate({ integration: "payments" })}
            >
              <span className="integration-icon">
                <CreditCard size={24} />
              </span>
              <h3>Razorpay</h3>
              <Badge tone="neutral">
                {data.paymentsConfigured
                  ? "Configuration detected"
                  : "Needs setup"}
              </Badge>
              <p>
                Payment links for household charges, with verified provider
                callbacks updating the ledger.
              </p>
              <span className="integration-card-state">
                {links.length} payment {links.length === 1 ? "link" : "links"}{" "}
                recorded
              </span>
              <strong>
                Manage payment links <ChevronRight size={15} aria-hidden="true" />
              </strong>
            </button>
          </div>
          <p className="integration-help">
            “Connected” means the account details are in place. Delivery and
            payments are confirmed message by message, and payment by payment.
          </p>
        </>
      ) : mode === "whatsapp" ? (
        <WhatsAppSettings
          key={JSON.stringify(data.settings)}
          tools={tools}
          data={data}
          onSaved={load}
        />
      ) : mode === "payments" ? (
        <>
          {!data.paymentsConfigured && (
            <div className="integration-setup-note">
              <CreditCard size={20} />
              <div>
                <strong>Razorpay needs server configuration</strong>
                <p>
                  An operator must configure the school’s credentials before
                  links can be created. Manual payment reporting and
                  verification remain available in Fees.
                </p>
                <button
                  className="button secondary"
                  onClick={() => navigate({ module: "billing" })}
                >
                  Open Fees <ChevronRight size={14} aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
          {creating ? (
            <PaymentLinkComposer
              tools={tools}
              houses={houses}
              enabled={data.paymentsConfigured}
              onSaved={async (id) => {
                await load();
                navigate({
                  integration: "payments",
                  action: "",
                  form: "",
                  link: id,
                  household: "",
                });
              }}
            />
          ) : link ? (
            selected ? (
              <article
                className="integration-link-detail"
                data-route-resource={selected.id}
              >
                <BackLink onClick={() => navigate({ link: "", action: "", form: "" })}>All payment links</BackLink>
                <h3>{family(text(selected, "household_id"))}</h3>
                <strong className="integration-link-amount">
                  {money(num(selected, "amount"))}
                </strong>
                <Badge
                  tone={
                    selected.status === "paid"
                      ? "success"
                      : ["unknown", "creating", "failed"].includes(
                            text(selected, "status"),
                          )
                        ? "attention"
                        : "neutral"
                  }
                >
                  {text(selected, "status")}
                </Badge>
                <p>
                  {["unknown", "creating"].includes(text(selected, "status"))
                    ? "The creation outcome needs checking. Reconcile with the provider before creating a replacement link."
                    : selected.status === "paid"
                      ? "Provider payment has been recorded. Open the household statement to check its ledger entries."
                      : "A payment link is a request for payment. Its presence does not confirm that money has been received."}
                </p>
                {!!selected.url && (
                  <a
                    className="button secondary"
                    href={text(selected, "url")}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open provider link{" "}
                    <ArrowUpRight size={14} aria-hidden="true" />
                  </a>
                )}
                <button
                  className="button secondary"
                  onClick={() =>
                    navigate({
                      module: "billing",
                      household: text(selected, "household_id"),
                    })
                  }
                >
                  Open household statement
                </button>
                {!!selected.error && (
                  <p className="notice">{text(selected, "error")}</p>
                )}
                {["unknown", "creating"].includes(text(selected, "status")) && (
                  <WorkflowForm
                    className="integration-reconcile"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!data.paymentsConfigured) return;
                      if (
                        await tools.command("payment-link.reconcile", {
                          id: selected.id,
                          providerId: new FormData(e.currentTarget).get(
                            "provider",
                          ),
                        })
                      ) {
                        await load();
                        navigate({ form: "", action: "" });
                        heading.current?.focus();
                      }
                    }}
                  >
                    <h4>Reconcile the provider result</h4>
                    <label>
                      Provider payment-link ID
                      <input
                        name="provider"
                        required
                        pattern="plink_[a-zA-Z0-9]+"
                        title="Use the provider link ID beginning with plink_, followed by letters or numbers."
                        placeholder="plink_…"
                      />
                    </label>
                    <button
                      className="button secondary"
                      disabled={!data.paymentsConfigured}
                    >
                      Reconcile with provider
                    </button>
                    {!data.paymentsConfigured && (
                      <p className="fine">
                        Configure the payment provider before checking this
                        link’s outcome.
                      </p>
                    )}
                  </WorkflowForm>
                )}
              </article>
            ) : (
              <div className="ui-empty">
                <h3>Payment link unavailable</h3>
                <button
                  onClick={() => navigate({ link: "", form: "", action: "" })}
                >
                  All payment links
                </button>
              </div>
            )
          ) : (
            <>
              <div className="integration-list-heading">
                <h3>Recorded payment links</h3>
                <button
                  className="button primary"
                  disabled={!data.paymentsConfigured}
                  onClick={() =>
                    navigate({
                      action: "create-payment-link",
                      form: "",
                      link: "",
                    })
                  }
                >
                  <Plus size={15} /> Create payment link
                </button>
              </div>
              {links.length ? (
                <div className="integration-link-list">
                  {links.map((l) => (
                    <button
                      className="button"
                      key={l.id}
                      onClick={() =>
                        navigate({ link: l.id, action: "", form: "" })
                      }
                    >
                      <span>
                        <strong>{family(text(l, "household_id"))}</strong>
                        <small>{dateLabel(text(l, "created_at"))}</small>
                      </span>
                      <strong>{money(num(l, "amount"))}</strong>
                      <Badge
                        tone={
                          ["unknown", "creating", "failed"].includes(
                            text(l, "status"),
                          )
                            ? "attention"
                            : "neutral"
                        }
                      >
                        {statusLabel(text(l, "status"))}
                      </Badge>
                      <ChevronRight size={16} aria-hidden="true" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="ui-empty">
                  <CreditCard size={26} />
                  <h3>No payment links yet</h3>
                  <p>
                    When the provider is configured, choose a household and the
                    charges to collect.
                  </p>
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <div className="ui-empty">
          <h3>Integration unavailable</h3>
          <p>Return to all integrations and choose a provider.</p>
        </div>
      )}
    </section>
  );
}

function WhatsAppSettings({
  tools,
  data,
  onSaved,
}: {
  tools: SchoolTools;
  data: Settings;
  onSaved: () => Promise<void>;
}) {
  const [enabled, setEnabled] = useState(!!data.settings.automated_messages),
    [saved, setSaved] = useState(false);
  return (
    <div className="integration-settings-grid">
      <WorkflowForm
        className="integration-settings-form"
        onChange={() => setSaved(false)}
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          if (
            await tools.command("integrations.update", {
              enabled,
              phoneId: String(f.get("phoneId") || "").trim() || undefined,
              template: String(f.get("template") || "").trim() || undefined,
              language: f.get("language"),
              dailyLimit: Number(f.get("limit")),
            })
          ) {
            setSaved(true);
            await onSaved();
          }
        }}
      >
        <h3>Delivery settings</h3>
        <label className="integration-switch">
          <input
            type="checkbox"
            name="enabled"
            checked={enabled}
            disabled={!data.whatsappConfigured && !enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span>
            <strong>Enable automatic WhatsApp messages</strong>
            <small>Eligible queued notices can be sent by the worker.</small>
          </span>
        </label>
        {!data.whatsappConfigured && (
          <p className="notice">
            Server credentials are not configured. You can prepare the fields
            below and use manual sharing in Messages.
          </p>
        )}
        <label>
          WhatsApp sender phone ID
          <input
            name="phoneId"
            required={enabled}
            pattern="[0-9]+"
            defaultValue={text(data.settings, "whatsapp_phone_id")}
          />
        </label>
        <label>
          Approved template name
          <input
            name="template"
            required={enabled}
            pattern="[a-z0-9_]+"
            title="Use lowercase letters, numbers and underscores, such as school_notice"
            defaultValue={text(data.settings, "whatsapp_template")}
          />
        </label>
        <div className="integration-fields-pair">
          <label>
            Language code
            <input
              name="language"
              required
              maxLength={10}
              defaultValue={text(data.settings, "whatsapp_language") || "en"}
            />
          </label>
          <label>
            Maximum sends per day
            <input
              type="number"
              name="limit"
              required
              min={1}
              max={10000}
              defaultValue={num(data.settings, "daily_message_limit") || 200}
            />
          </label>
        </div>
        <button className="button primary">Save automation settings</button>
        {saved && (
          <p role="status">
            <Check size={14} /> Settings saved
          </p>
        )}
      </WorkflowForm>
      <aside className="integration-help-panel">
        <MessageCircle size={24} />
        <h3>Before automatic delivery</h3>
        <ol>
          <li>Configure school credentials on the server.</li>
          <li>Enter an approved sender, template and language.</li>
          <li>Run the worker and verify delivery using a test recipient.</li>
        </ol>
        <p>
          The switch stores your preference. Message status is the place to
          check actual outcomes.
        </p>
        <button
          className="button secondary"
          onClick={() => navigate({ module: "messages" })}
        >
          Open Messages <ChevronRight size={14} aria-hidden="true" />
        </button>
      </aside>
    </div>
  );
}

function PaymentLinkComposer({
  tools,
  houses,
  enabled,
  onSaved,
}: {
  tools: SchoolTools;
  houses: Row[];
  enabled: boolean;
  onSaved: (id: string) => Promise<void>;
}) {
  const [household, setHousehold] = useRouteValue("household"),
    [charges, setCharges] = useState<Row[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [error, setError] = useState(""),
    [loadedFor, setLoadedFor] = useState(""),
    [revision, setRevision] = useState(0),
    [key, setKey] = useState(crypto.randomUUID());
  useEffect(() => {
    let active = true;
    setCharges([]);
    setSelected([]);
    setError("");
    setLoadedFor("");
    setKey(crypto.randomUUID());
    if (household)
      tools
        .read<{ charges: Row[] }>("statement", "?id=" + household)
        .then((d) => {
          if (active) {
            setCharges(d.charges.filter((c) => num(c, "due") > 0));
            setLoadedFor(household);
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [household, tools.read, revision]);
  const ready = loadedFor === household && !!household,
    total = charges
      .filter((c) => selected.includes(c.id))
      .reduce((n, c) => n + num(c, "due"), 0);
  return (
    <WorkflowForm
      className="integration-link-composer"
      onSubmit={async (e) => {
        e.preventDefault();
        const result = await tools.command<Row>("payment-link.create", {
          household,
          charges: selected,
          key,
        });
        if (result) await onSaved(result.id);
      }}
    >
      <BackLink onClick={() => navigate({ action: "", form: "", household: "" })}>Cancel new link</BackLink>
      <h3>Choose the charges to collect</h3>
      <Select
        label="Household"
        rows={houses.filter((h) => !h.archived_at)}
        value={household}
        onChange={setHousehold}
      />
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => setRevision((r) => r + 1)}>
            Try again
          </button>
        </div>
      ) : household && !ready ? (
        <p role="status">Loading outstanding charges…</p>
      ) : ready ? (
        <>
          <div className="integration-charge-picker">
            {charges.map((c) => (
              <label key={c.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(c.id)}
                  onChange={(e) =>
                    setSelected((v) =>
                      e.target.checked
                        ? [...v, c.id]
                        : v.filter((id) => id !== c.id),
                    )
                  }
                />
                <span>
                  <strong>{text(c, "description")}</strong>
                  <small>
                    {text(c, "learner_name") || "Household contribution"}
                  </small>
                </span>
                <strong>{money(num(c, "due"))}</strong>
              </label>
            ))}
          </div>
          {!charges.length && (
            <p className="ui-empty">
              This household has no outstanding charges.
            </p>
          )}
        </>
      ) : (
        <p className="fine">
          Choose a household to see its current unpaid charges.
        </p>
      )}
      <div className="integration-link-total">
        <span>Requested amount · INR</span>
        <strong>{money(total)}</strong>
      </div>
      <button
        className="button primary"
        disabled={!enabled || !ready || !!error || !selected.length}
      >
        Create Razorpay payment link
      </button>
      <p className="fine">
        The link requests this amount. Received money is recorded only after
        provider verification. If a request has an uncertain outcome, inspect
        its record before creating another link.
      </p>
    </WorkflowForm>
  );
}
