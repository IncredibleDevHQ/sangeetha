import { useEffect, useRef, useState } from "react";
import { Check, Users } from "lucide-react";
import { WorkflowForm } from "../../components/WorkflowForm";
import { text, type Row, type SchoolTools } from "./common";

export function TeacherAttendance({
  tools,
  occurrence,
  learners,
  marks,
  onSaved,
}: {
  tools: SchoolTools;
  occurrence: Row;
  learners: Row[];
  marks: Row[];
  onSaved: () => Promise<void>;
}) {
  const initial = Object.fromEntries(
    marks.map((m) => [text(m, "learner_id"), text(m, "status")]),
  );
  const [statuses, setStatuses] = useState<Record<string, string>>(initial),
    [notes, setNotes] = useState(text(occurrence, "teaching_notes")),
    [saved, setSaved] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const marked = learners.filter((l) => statuses[l.id]).length;
  const changed =
    learners.some((l) => (statuses[l.id] || "") !== (initial[l.id] || "")) ||
    notes !== text(occurrence, "teaching_notes");
  const cancelled = occurrence.status === "cancelled";
  return (
    <section className="teacher-attendance" data-route-resource={occurrence.id}>
      <div className="teacher-attendance-heading">
        <div>
          <span className="eyebrow">Your assigned class</span>
          <h2 ref={heading} tabIndex={-1}>
            Attendance & lesson notes
          </h2>
          <p>
            Review each learner before saving. Unmarked learners stay unmarked.
          </p>
        </div>
        <span className="teacher-attendance-count">
          <Users size={16} />
          {marked} / {learners.length} marked
        </span>
      </div>
      {cancelled ? (
        <p role="status">
          This class is cancelled. Attendance cannot be changed.
        </p>
      ) : (
        <WorkflowForm
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await tools.command("class.attendance", {
                id: occurrence.id,
                entries: learners
                  .filter((l) => statuses[l.id])
                  .map((l) => ({ learner: l.id, status: statuses[l.id] })),
                notes,
              })
            ) {
              setSaved(true);
              await onSaved();
            }
          }}
        >
          {learners.length > 0 && (
            <button
              type="button"
              className="button secondary"
              disabled={marked === learners.length}
              onClick={() => {
                setStatuses((previous) =>
                  Object.fromEntries(
                    learners.map((l) => [l.id, previous[l.id] || "present"]),
                  ),
                );
                setSaved(false);
              }}
            >
              Mark unmarked learners present
            </button>
          )}
          <div className="teacher-attendance-list">
            {learners.map((l) => (
              <label key={l.id}>
                <span>
                  <strong>{text(l, "name")}</strong>
                  <small>
                    {initial[l.id] ? "Previously saved" : "Not saved yet"}
                  </small>
                </span>
                <select
                  aria-label={`Attendance for ${text(l, "name")}`}
                  value={statuses[l.id] || ""}
                  onChange={(e) => {
                    setStatuses((v) => ({ ...v, [l.id]: e.target.value }));
                    setSaved(false);
                  }}
                >
                  <option value="" disabled={!!initial[l.id]}>
                    Not marked
                  </option>
                  <option value="present">Present</option>
                  <option value="absent">Absent</option>
                  <option value="excused">Excused</option>
                </select>
              </label>
            ))}
          </div>
          {!learners.length && (
            <p className="ui-empty">
              No learners were enrolled for this class date.
            </p>
          )}
          <label className="teacher-lesson-notes">
            Lesson notes
            <textarea
              value={notes}
              maxLength={4000}
              rows={4}
              onChange={(e) => {
                setNotes(e.target.value);
                setSaved(false);
              }}
              placeholder="What did the class work on? What needs another pass?"
            />
          </label>
          <p className="fine">
            These notes are for staff assigned to this class. Share learner
            instructions through lessons or practice tasks.
          </p>
          <div className="teacher-attendance-actions">
            <button
              className="button primary"
              disabled={!changed || tools.busy}
            >
              Save learner attendance
            </button>
            <span role="status">
              {saved ? (
                <>
                  <Check size={15} /> Saved for this class
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
