import { WorkflowForm } from "../../components/WorkflowForm";
import { useEffect, useState } from "react";
import { type Row, type SchoolTools, text, num, money, Select } from "./common";
export { MessagesView } from "./Messages";
export { ReportsView } from "./Reports";
export { AccessView } from "./Access";
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
      <WorkflowForm
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
      </WorkflowForm>
      <h3>Payment links</h3>
      <WorkflowForm
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
      </WorkflowForm>
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
            <WorkflowForm
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
            </WorkflowForm>
          )}
        </article>
      ))}
    </>
  );
}
