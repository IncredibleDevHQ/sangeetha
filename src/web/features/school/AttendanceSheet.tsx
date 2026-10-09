import { useState } from "react";
import { Check } from "lucide-react";
import { WorkflowForm } from "../../components/WorkflowForm";
import { type SchoolTools } from "./common";

const CHOICES = [
  ["present", "Present"],
  ["late", "Late"],
  ["absent", "Absent"],
  ["excused", "Excused"],
] as const;

/**
 * The one way to take attendance, for office staff and teachers alike: a
 * one-tap choice per learner, a bulk "mark the rest present", lesson notes and
 * a clear saved state.
 */
export function AttendanceSheet({
  tools,
  occurrence,
  cancelled,
  learners,
  saved: savedMarks,
  notes: savedNotes,
  notesHint,
  onSaved,
}: {
  tools: SchoolTools;
  occurrence: string;
  cancelled: boolean;
  learners: { id: string; name: string }[];
  saved: Record<string, string>;
  notes: string;
  notesHint?: string;
  onSaved: () => Promise<void>;
}) {
  const [marks, setMarks] = useState<Record<string, string>>(savedMarks),
    [notes, setNotes] = useState(savedNotes),
    [justSaved, setJustSaved] = useState(false);
  const marked = learners.filter((l) => marks[l.id]).length;
  const changed =
    learners.some((l) => (marks[l.id] || "") !== (savedMarks[l.id] || "")) ||
    notes !== savedNotes;
  const choose = (learner: string, status: string) => {
    setMarks((m) => ({ ...m, [learner]: status }));
    setJustSaved(false);
  };
  return (
    <section className="attendance-sheet" data-route-resource={occurrence}>
      <div className="attendance-sheet-heading">
        <div>
          <h3>Attendance</h3>
          <p>
            {marked} of {learners.length} marked
          </p>
        </div>
        {!cancelled && learners.length > 0 && (
          <button
            type="button"
            className="button secondary"
            disabled={marked === learners.length}
            onClick={() => {
              setMarks((m) =>
                Object.fromEntries(
                  learners.map((l) => [l.id, m[l.id] || "present"]),
                ),
              );
              setJustSaved(false);
            }}
          >
            Mark the rest present
          </button>
        )}
      </div>
      {cancelled ? (
        <p className="record-notice" role="status">
          This class is cancelled, so attendance can’t be marked.
        </p>
      ) : (
        <WorkflowForm
          className="attendance-sheet-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const result = await tools.command("class.attendance", {
              id: occurrence,
              entries: learners
                .filter((l) => marks[l.id])
                .map((l) => ({ learner: l.id, status: marks[l.id] })),
              notes,
            });
            if (result !== undefined) {
              setJustSaved(true);
              await onSaved();
            }
          }}
        >
          {learners.length ? (
            <ul className="attendance-list">
              {learners.map((l) => (
                <li key={l.id}>
                  <span className="attendance-name">
                    <strong>{l.name}</strong>
                    <small>
                      {savedMarks[l.id] ? "Saved" : "Not marked yet"}
                    </small>
                  </span>
                  <fieldset className="attendance-choice">
                    <legend className="visually-hidden">
                      Attendance for {l.name}
                    </legend>
                    {CHOICES.map(([value, label]) => (
                      <label key={value} data-choice={value}>
                        <input
                          type="radio"
                          name={"attendance-" + l.id}
                          value={value}
                          checked={marks[l.id] === value}
                          onChange={() => choose(l.id, value)}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </fieldset>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ui-empty">
              No learners were enrolled for this class date.
            </p>
          )}
          <label className="attendance-notes">
            Lesson notes
            <textarea
              value={notes}
              maxLength={4000}
              rows={3}
              placeholder="What did the class work on? What needs another pass?"
              onChange={(e) => {
                setNotes(e.target.value);
                setJustSaved(false);
              }}
            />
          </label>
          {notesHint && <p className="fine">{notesHint}</p>}
          <div className="attendance-actions">
            <button
              className="button primary"
              disabled={!changed || tools.busy}
            >
              Save attendance
            </button>
            <span role="status">
              {justSaved ? (
                <>
                  <Check size={15} aria-hidden="true" /> Saved
                </>
              ) : changed ? (
                "Unsaved changes"
              ) : (
                "Up to date"
              )}
            </span>
          </div>
        </WorkflowForm>
      )}
    </section>
  );
}
