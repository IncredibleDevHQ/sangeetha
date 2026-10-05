import { useId, type ReactNode } from "react";
import { text, num } from "./common";

/** Shared domain fields keep draft creation and lesson editing consistent. */
export function LessonFields({
  initial,
  creating = false,
  suggestions,
  audience,
}: {
  initial: Record<string, unknown>;
  creating?: boolean;
  suggestions: { curricula: string[]; categories: string[]; blocks: string[] };
  audience?: ReactNode;
}) {
  const id = useId();
  return (
    <>
      <div className="composer-section wide">
        <span>01</span>
        <div>
          <h3>Lesson basics</h3>
          <p>A clear title helps learners find their next practice.</p>
        </div>
      </div>
      <label className="wide">
        Title
        <input
          required
          name="title"
          maxLength={150}
          defaultValue={text(initial, "title")}
          placeholder="Sarali varisai · first pattern"
        />
      </label>
      <div className="composer-section wide">
        <span>02</span>
        <div>
          <h3>Place in the curriculum</h3>
          <p>
            Choose an existing name or type a new one. Categories contain
            blocks; blocks contain lessons.
          </p>
        </div>
      </div>
      <label>
        Curriculum name
        <input
          required
          name="curriculum"
          maxLength={120}
          list={id + "-curricula"}
          defaultValue={text(initial, "curriculum")}
        />
      </label>
      {creating && (
        <label>
          Level
          <input
            required
            name="level"
            maxLength={80}
            defaultValue={text(initial, "level") || "Beginner"}
          />
        </label>
      )}
      <label>
        Category
        <input
          required
          name="category"
          maxLength={120}
          list={id + "-categories"}
          defaultValue={text(initial, "category") || "Foundations"}
        />
      </label>
      <label>
        Block name
        <input
          required
          name="module"
          maxLength={100}
          list={id + "-blocks"}
          defaultValue={text(initial, "module") || "Foundations"}
        />
      </label>
      <datalist id={id + "-curricula"}>
        {suggestions.curricula.map((v) => (
          <option value={v} key={v} />
        ))}
      </datalist>
      <datalist id={id + "-categories"}>
        {suggestions.categories.map((v) => (
          <option value={v} key={v} />
        ))}
      </datalist>
      <datalist id={id + "-blocks"}>
        {suggestions.blocks.map((v) => (
          <option value={v} key={v} />
        ))}
      </datalist>
      <div className="lesson-order wide">
        <label>
          Category order
          <input
            required
            type="number"
            name="categoryPosition"
            min="1"
            max="10000"
            defaultValue={num(initial, "category_position") || 1}
          />
        </label>
        <label>
          Block order
          <input
            required
            type="number"
            name="blockPosition"
            min="1"
            max="10000"
            defaultValue={num(initial, "block_position") || 1}
          />
        </label>
        <label>
          Lesson number
          <input
            required
            type="number"
            name="position"
            min="1"
            max="10000"
            defaultValue={num(initial, "position") || 1}
          />
        </label>
      </div>
      {audience && (
        <div className="wide composer-audience">
          {audience}
          <p className="fine">
            A selected batch defines the audience. Without a batch, published
            lessons are available to authorised learners at this level.
          </p>
        </div>
      )}
      <div className="composer-section wide">
        <span>03</span>
        <div>
          <h3>Teaching content</h3>
          <p>
            Add your guidance and notation. Recordings can be uploaded after
            saving.
          </p>
        </div>
      </div>
      <label>
        Raagam
        <input
          name="raga"
          maxLength={100}
          defaultValue={text(initial, "raga")}
          placeholder="e.g. Mayamalavagowla"
        />
      </label>
      <label>
        Thaalam
        <input
          name="tala"
          maxLength={100}
          defaultValue={text(initial, "tala")}
          placeholder="e.g. Adi"
        />
      </label>
      <label className="wide">
        Lesson instructions
        <textarea
          name="instructions"
          rows={4}
          maxLength={5000}
          defaultValue={text(initial, "instructions")}
        />
      </label>
      <label className="wide">
        Music notes
        <textarea
          name="musicNotes"
          className="music-notes-input"
          rows={5}
          maxLength={20000}
          defaultValue={text(initial, "music_notes")}
          placeholder="S R G M | P D N Ṡ"
        />
      </label>
    </>
  );
}
