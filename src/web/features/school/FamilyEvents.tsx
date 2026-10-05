import { useEffect, useRef, useState } from "react";
import { CalendarDays, MapPin, Users } from "lucide-react";
import { WorkflowForm } from "../../components/WorkflowForm";
import { dateLabel } from "../../components/ui";
import { navigate, useRouteValue } from "../../routes";
import { Select, text, num, money, type Row, type SchoolTools } from "./common";
type Data = {
  events: Row[];
  households: Row[];
  people: Row[];
  registrations: Row[];
};

export function FamilyEvents({ tools }: { tools: SchoolTools }) {
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState("");
  const [event, setEvent] = useRouteValue("event"),
    [householdRoute, setHousehold] = useRouteValue("household");
  const [selection, setSelection] = useState({
    scope: "",
    people: [] as string[],
  });
  const request = useRef(0);
  async function load() {
    const version = ++request.current;
    setError("");
    try {
      const result = await tools.read<Data>("family-events");
      if (version === request.current) setData(result);
    } catch (e) {
      if (version === request.current) setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
    return () => {
      request.current++;
    };
  }, [tools.read]);
  if (error)
    return (
      <div className="ui-empty" role="alert">
        <h3>We couldn’t load family events</h3>
        <p>{error}</p>
        <button onClick={() => void load()}>Try again</button>
      </div>
    );
  if (!data)
    return (
      <p className="ui-empty" role="status">
        Loading family events…
      </p>
    );
  if (!data.households.length)
    return (
      <p className="ui-empty">
        Household access is needed to register family participants.
      </p>
    );
  if (!data.events.length)
    return (
      <div className="ui-empty">
        <CalendarDays size={26} />
        <h3>No upcoming events</h3>
        <p>
          The school’s next gathering will appear here when registration opens.
        </p>
      </div>
    );
  const household =
    householdRoute ||
    (data.households.length === 1 ? data.households[0].id : "");
  const current = data.events.find((e) => e.id === event),
    scope = event + ":" + household;
  const registered = data.registrations.filter(
    (r) =>
      r.event_id === event && r.household_id === household && !r.cancelled_at,
  );
  const members = data.people.filter((p) => p.household_id === household);
  const people =
    selection.scope === scope
      ? selection.people.filter(
          (id) =>
            members.some((p) => p.id === id) &&
            !registered.some((r) => r.person_id === id),
        )
      : [];
  const amount =
    current && people.length
      ? num(current, "contribution") *
        (current.basis === "household"
          ? registered.length
            ? 0
            : 1
          : people.length)
      : 0;
  return (
    <section className="family-event-workspace">
      <div>
        <span className="eyebrow">Music, together</span>
        <h2>Join your school’s next event</h2>
        <p>Choose who is attending and review the family contribution.</p>
      </div>
      <WorkflowForm
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await tools.command("event.register", { event, household, people })
          ) {
            setSelection({ scope: "", people: [] });
            await load();
          }
        }}
      >
        <div className="family-event-selectors">
          <Select
            label="Event"
            rows={data.events}
            labelKey="title"
            value={event}
            onChange={setEvent}
          />
          <Select
            label="Household"
            rows={data.households}
            value={household}
            onChange={setHousehold}
          />
        </div>
        {event && !current && (
          <p role="status">
            This event is unavailable or no longer open. Choose an upcoming
            event.
          </p>
        )}
        {household && !data.households.some((h) => h.id === household) && (
          <p role="status">Choose a household you have access to.</p>
        )}
        {current && (
          <>
            <div className="family-event-intro">
              <h3>{text(current, "title")}</h3>
              <p>
                <CalendarDays size={16} />
                {dateLabel(text(current, "starts_at"), true)}
              </p>
              <p>
                <MapPin size={16} />
                {text(current, "venue")}
              </p>
              <p>{text(current, "description")}</p>
              <strong>
                {money(num(current, "contribution"))} per{" "}
                {text(current, "basis")}
              </strong>
            </div>
            <h3>Who will join?</h3>
            {!household && (
              <p className="fine">
                Choose your household to see its family members.
              </p>
            )}
            <div className="family-event-members">
              {members.map((p) => {
                const already = registered.some((r) => r.person_id === p.id);
                return (
                  <label key={p.id}>
                    <input
                      type="checkbox"
                      disabled={already}
                      checked={already || people.includes(p.id)}
                      onChange={(e) =>
                        setSelection({
                          scope,
                          people: e.target.checked
                            ? [...people, p.id]
                            : people.filter((id) => id !== p.id),
                        })
                      }
                    />
                    <span>
                      <strong>{text(p, "name")}</strong>
                      <small>
                        {already ? "Registered" : "Available to register"}
                      </small>
                    </span>
                    <Users size={16} />
                  </label>
                );
              })}
            </div>
            {household && !members.length && (
              <p className="ui-empty">
                No current family members are available for this household.
              </p>
            )}
            <div className="family-event-total">
              <div>
                <span>Additional contribution</span>
                <strong>{money(amount)}</strong>
              </div>
              <p>
                {people.length} new{" "}
                {people.length === 1 ? "participant" : "participants"}
                {current.basis === "household"
                  ? registered.length
                    ? " · Household contribution already charged"
                    : " · One contribution for the household"
                  : " · Contribution applies to each selected person"}
              </p>
            </div>
            <div className="family-payment-actions">
              <button
                className="button primary"
                disabled={
                  !people.length ||
                  !data.households.some((h) => h.id === household)
                }
              >
                Confirm participants and contribution
              </button>
              <button
                type="button"
                className="button secondary"
                onClick={() =>
                  navigate({
                    familyView: "statement",
                    household,
                    event: "",
                    action: "",
                    form: "",
                  })
                }
              >
                View statement
              </button>
            </div>
          </>
        )}
      </WorkflowForm>
    </section>
  );
}
