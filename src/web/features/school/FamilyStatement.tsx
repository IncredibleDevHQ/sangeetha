import { useEffect, useRef, useState } from "react";
import { Download, Wallet } from "lucide-react";
import {
  Badge,
  BackLink,
  StatusPill,
  dateLabel,
  paymentMethod,
  statusLabel,
} from "../../components/ui";
import { WorkflowForm } from "../../components/WorkflowForm";
import { navigate, useRouteValue } from "../../routes";
import { text, num, money, type Row, type SchoolTools } from "./common";

export function Statement({
  tools,
  household,
}: {
  tools: SchoolTools;
  household: Row;
}) {
  const [data, setData] = useState<{ charges: Row[]; payments: Row[] } | null>(
      null,
    ),
    [error, setError] = useState(""),
    [key, setKey] = useState(crypto.randomUUID());
  const [action] = useRouteValue("action"),
    [form] = useRouteValue("form");
  const request = useRef(0),
    heading = useRef<HTMLHeadingElement>(null);
  const reporting =
    action === "report-payment" ||
    form === "submit-for-verification" ||
    form === "submit-for-verification-" + household.id;
  async function load() {
    const version = ++request.current;
    setError("");
    try {
      const result = await tools.read<NonNullable<typeof data>>(
        "statement",
        "?id=" + household.id,
      );
      if (version === request.current) setData(result);
    } catch (e) {
      if (version === request.current) setError((e as Error).message);
    }
  }
  useEffect(() => {
    setData(null);
    void load();
    return () => {
      request.current++;
    };
  }, [household.id, tools.read]);
  useEffect(() => {
    heading.current?.focus();
  }, [reporting, data === null]);
  if (error)
    return (
      <div className="ui-empty" role="alert">
        <h3>We couldn’t load this statement</h3>
        <p>{error}</p>
        <button onClick={() => void load()}>Try again</button>
      </div>
    );
  if (!data)
    return (
      <p className="ui-empty" role="status">
        Loading your household statement…
      </p>
    );
  const close = () => navigate({ action: "", form: "" });
  const balance = data.charges.reduce((n, c) => n + num(c, "due"), 0),
    credit = data.payments
      .filter((p) => p.status === "verified")
      .reduce((n, p) => n + num(p, "credit"), 0);
  if (reporting)
    return (
      <section className="family-statement" data-route-resource={household.id}>
        <BackLink onClick={close}>Back to statement</BackLink>
        <header>
          <span className="eyebrow">{text(household, "name")}</span>
          <h2 ref={heading} tabIndex={-1}>
            Tell us about your payment
          </h2>
          <p>
            Already paid the school? Share the amount and reference so the
            office can check it.
          </p>
        </header>
        <WorkflowForm
          className="family-payment-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            if (
              await tools.command("billing.payment", {
                household: household.id,
                amount: Math.round(Number(f.get("amount")) * 100),
                method: f.get("method"),
                reference: f.get("reference"),
                key,
              })
            ) {
              setKey(crypto.randomUUID());
              await load();
              close();
            }
          }}
        >
          <label>
            Amount paid (INR)
            <input
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              required
            />
          </label>
          <label>
            Payment method
            <select name="method">
              <option value="upi">UPI</option>
              <option value="bank">Bank transfer</option>
              <option value="cash">Cash</option>
            </select>
          </label>
          <label className="wide">
            Transfer reference
            <input
              name="reference"
              required
              placeholder="Transaction ID or reference shared with the office"
            />
          </label>
          <p className="wide family-payment-note">
            This reports a payment you have made. Your balance changes after the
            school verifies and allocates it.
          </p>
          <div className="wide family-payment-actions">
            <button className="button primary">Submit for verification</button>
            <button className="button secondary" type="button" onClick={close}>
              Cancel
            </button>
          </div>
        </WorkflowForm>
      </section>
    );
  return (
    <section className="family-statement">
      <header className="family-statement-heading">
        <div>
          <h2 ref={heading} tabIndex={-1}>
            {text(household, "name")}
          </h2>
          <p>Each learner’s charges, together in one place.</p>
        </div>
        <button
          className="button primary"
          onClick={() =>
            navigate({
              household: household.id,
              action: "report-payment",
              form: "",
            })
          }
        >
          <Wallet size={16} aria-hidden="true" /> Report a payment
        </button>
      </header>
      <div className="family-balance-summary">
        <div>
          <span>Outstanding balance</span>
          <strong>{money(balance)}</strong>
        </div>
        {credit > 0 && (
          <div>
            <span>Received, being applied to charges</span>
            <strong>{money(credit)}</strong>
          </div>
        )}
      </div>
      <h3>Charges</h3>
      <div className="family-charge-list">
        {data.charges.map((c) => (
          <article key={c.id}>
            <div>
              <strong>{text(c, "description")}</strong>
              <span>
                {text(c, "learner_name") || "Household contribution"} ·{" "}
                {c.event_id ? "Event" : "Tuition"}
              </span>
              <small>Due {dateLabel(text(c, "due_on").slice(0, 10))}</small>
            </div>
            <div className="family-charge-amount">
              {num(c, "due") === 0 ? (
                <>
                  <strong>Paid</strong>
                  <small>{money(num(c, "amount"))}</small>
                </>
              ) : num(c, "due") < num(c, "amount") ? (
                <>
                  <strong>{money(num(c, "due"))}</strong>
                  <small>Still due · of {money(num(c, "amount"))}</small>
                </>
              ) : (
                <>
                  <strong>{money(num(c, "due"))}</strong>
                  <small>Due</small>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
      {!data.charges.length && (
        <p className="ui-empty">There are no charges on this statement yet.</p>
      )}
      <div className="family-payments-heading">
        <h3>Payments & receipts</h3>
        <span>
          {data.payments.filter((p) => p.status === "claim").length} awaiting
          verification
        </span>
      </div>
      <div className="family-payment-list">
        {data.payments.map((p) => (
          <article key={p.id}>
            <div>
              <strong>{money(num(p, "amount"))}</strong>
              <p>
                {paymentMethod(text(p, "method"))} ·{" "}
                {text(p, "reference") || "No reference"}
              </p>
            </div>
            <StatusPill status={text(p, "status")} />
            {!!p.receipt && (
              <button
                className="button secondary"
                onClick={() =>
                  tools.download(
                    "receipt-" + p.id + ".txt",
                    `${tools.school.name}\nReceipt ${text(p, "receipt")}\n${text(household, "name")}\nINR ${num(p, "amount") / 100}\nPaid by ${paymentMethod(text(p, "method"))}\nReference ${text(p, "reference")}\nStatus ${statusLabel(text(p, "status"))}`,
                    "text/plain",
                  )
                }
              >
                <Download size={14} /> Receipt
              </button>
            )}
          </article>
        ))}
      </div>
      {!data.payments.length && (
        <p className="ui-empty">
          No payments yet. After you pay the school, use Report a payment so
          the office can match it.
        </p>
      )}
    </section>
  );
}

/** A family's balance at a glance, and the way to report a payment. */
export function FamilyBalance({
  tools,
  household,
}: {
  tools: SchoolTools;
  household: Row;
}) {
  const [due, setDue] = useState<number | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    tools
      .read<{ charges: Row[] }>("statement", "?id=" + household.id)
      .then((r) => {
        if (active) setDue(r.charges.reduce((n, c) => n + num(c, "due"), 0));
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, [household.id, tools.read]);
  const open = (action = "") =>
    navigate({
      section: "family",
      familyView: "statement",
      household: household.id,
      action,
      form: "",
    });
  return (
    <section className="family-balance">
      <div>
        <span className="eyebrow">{text(household, "name")}</span>
        <h2>
          {error
            ? "Balance unavailable"
            : due === null
              ? "Checking your balance…"
              : due > 0
                ? `${money(due)} due`
                : "All paid up"}
        </h2>
        <p>
          {error ||
            (due && due > 0
              ? "Paid already? Tell the office, and they’ll check it."
              : "Charges and payments appear on your statement.")}
        </p>
      </div>
      <div className="family-balance-actions">
        {!!due && due > 0 && (
          <button
            className="button primary"
            onClick={() => open("report-payment")}
          >
            Report a payment
          </button>
        )}
        <button className="button secondary" onClick={() => open()}>
          See statement
        </button>
      </div>
    </section>
  );
}
