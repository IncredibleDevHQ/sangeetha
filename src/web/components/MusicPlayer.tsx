import { WorkflowDetails } from "./WorkflowDetails";
import { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, Music2 } from "lucide-react";
import { activeCue, groupCues, type NoteCue } from "../../shared/score";
import { type Row, type SchoolTools, text } from "../features/school/common";
const stamp = (n: number) =>
  `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, "0")}`;
export function MusicPlayer({
  tools,
  asset,
  lesson,
  editable,
  onSaved,
}: {
  tools: SchoolTools;
  asset: Row;
  lesson: Row;
  editable: boolean;
  onSaved: () => void;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const [time, setTime] = useState(0),
    [duration, setDuration] = useState(Number(asset.duration_ms) / 1000 || 0),
    [playing, setPlaying] = useState(false),
    [rate, setRate] = useState(1),
    [error, setError] = useState("");
  const cues = (asset.note_cues || []) as NoteCue[];
  const [draft, setDraft] = useState<NoteCue[]>(cues),
    [editing, setEditing] = useState(false),
    [loop, setLoop] = useState(false);
  const active = activeCue(cues, time);
  useEffect(() => {
    setDraft(cues);
  }, [asset.note_cues]);
  const seek = (value: number) => {
    if (audio.current) {
      audio.current.currentTime = value;
      setTime(value);
    }
  };
  const toggle = async () => {
    if (!audio.current) return;
    setError("");
    if (!audio.current.paused) audio.current.pause();
    else
      try {
        await audio.current.play();
      } catch {
        setError("Playback could not start. Try again.");
      }
  };
  const update = (index: number, field: keyof NoteCue, value: string) =>
    setDraft((d) =>
      d.map((c, i) =>
        i === index
          ? {
              ...c,
              [field]:
                field === "start" || field === "end" ? Number(value) : value,
            }
          : c,
      ),
    );
  return (
    <section
      className="music-player"
      aria-label={`Music player: ${text(asset, "filename")}`}
    >
      <header className="music-player-heading">
        <Music2 size={20} />
        <div>
          <span className="eyebrow">LISTEN & PRACTISE</span>
          <h4>{text(asset, "filename")}</h4>
        </div>
      </header>
      <div className="music-context">
        <div>
          <span>Raagam</span>
          <strong>{text(lesson, "raga") || "Not specified"}</strong>
        </div>
        <div>
          <span>Thaalam</span>
          <strong>{text(lesson, "tala") || "Not specified"}</strong>
        </div>
        <div>
          <span>Current beat</span>
          <strong>{active >= 0 ? cues[active].beat || "—" : "—"}</strong>
        </div>
      </div>
      <audio
        ref={audio}
        preload="metadata"
        src={`/api/schools/${tools.school.id}/media/${asset.id}`}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onSeeked={(e) => setTime(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setTime(duration);
        }}
        onError={() =>
          setError(
            "This recording could not be loaded. Reload the lesson to try again.",
          )
        }
        loop={loop}
      />
      <div className="music-notes-follow" aria-label="Timed music notes">
        {groupCues(cues).map((group, bar) => (
          <div
            key={bar}
            className={`music-phrase ${group.some((n) => n.index === active) ? "is-current" : ""}`}
            role="group"
            aria-label={`Phrase ${bar + 1}`}
            data-active={
              group.some((n) => n.index === active) ? "true" : "false"
            }
          >
            <span className="phrase-number" aria-hidden="true">
              {bar + 1}
            </span>
            <div className="phrase-notes">
              {group.map(({ cue, index }) => (
                <button
                  key={index}
                  type="button"
                  aria-current={index === active ? "step" : undefined}
                  aria-label={`${cue.note}, ${cue.start} seconds${cue.beat ? `, beat ${cue.beat}` : ""}`}
                  onClick={() => seek(cue.start)}
                >
                  {cue.note}
                </button>
              ))}
            </div>
            <span className="phrase-bar" aria-hidden="true">
              |
            </span>
          </div>
        ))}
        {!cues.length && (
          <p>
            No timed notes yet.{" "}
            {text(lesson, "music_notes")
              ? "Follow the lesson notes above while you listen."
              : "Your teacher can add notes to this recording."}
          </p>
        )}
      </div>
      <div className="music-transport">
        <button
          type="button"
          className="ui-action-primary"
          aria-label={playing ? "Pause recording" : "Play recording"}
          onClick={() => void toggle()}
        >
          {playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button
          type="button"
          aria-label="Restart recording"
          onClick={() => seek(0)}
        >
          <RotateCcw size={16} />
        </button>
        <span>
          {stamp(time)} / {stamp(duration)}
        </span>
        <label>
          Speed
          <select
            aria-label="Playback speed"
            value={rate}
            onChange={(e) => {
              const value = Number(e.target.value);
              setRate(value);
              if (audio.current) audio.current.playbackRate = value;
            }}
          >
            {[0.5, 0.75, 1, 1.25, 1.5].map((r) => (
              <option key={r} value={r}>
                {r}×
              </option>
            ))}
          </select>
        </label>
        <label className="music-loop">
          <input
            type="checkbox"
            checked={loop}
            onChange={(e) => setLoop(e.target.checked)}
          />
          Repeat
        </label>
      </div>
      <input
        className="music-seek"
        type="range"
        aria-label="Recording position"
        min="0"
        max={duration || 0}
        step="0.01"
        value={Math.min(time, duration)}
        onChange={(e) => seek(Number(e.target.value))}
      />
      {error && <p role="alert">{error}</p>}
      {editable && (
        <WorkflowDetails
          context={{ lesson: lesson.id, asset: asset.id, mode: "materials" }}
          onToggle={(e) => setEditing(e.currentTarget.open)}
        >
          <summary>Align notes to this recording</summary>
          {editing && (
            <>
              <p>
                Use seconds from this recording. Notes highlight during each
                interval; gaps have no highlighted note. Add beat labels to
                follow the thaalam. Timings are teacher-authored.
              </p>
              <div className="toolbar">
                <span>Phrase grouping</span>
                {[3, 4].map((size) => (
                  <button
                    type="button"
                    key={size}
                    onClick={() =>
                      setDraft((d) =>
                        d.map((cue, i) => ({
                          ...cue,
                          barStart: i % size === 0,
                        })),
                      )
                    }
                  >
                    Group in {size}s
                  </button>
                ))}
              </div>
              <p>
                Start a new phrase wherever a bar belongs. Three- and four-note
                groups can be mixed.
              </p>
              <div className="score-editor">
                {draft.map((cue, i) => (
                  <div className="score-editor-row" key={i}>
                    <label>
                      Note {i + 1}
                      <input
                        value={cue.note}
                        onChange={(e) => update(i, "note", e.target.value)}
                      />
                    </label>
                    <label>
                      Start
                      <input
                        aria-label={`Note ${i + 1} start`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={cue.start}
                        onChange={(e) => update(i, "start", e.target.value)}
                      />
                    </label>
                    <label>
                      End
                      <input
                        aria-label={`Note ${i + 1} end`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={cue.end}
                        onChange={(e) => update(i, "end", e.target.value)}
                      />
                    </label>
                    <label>
                      Beat
                      <input
                        aria-label={`Note ${i + 1} beat`}
                        value={cue.beat || ""}
                        onChange={(e) => update(i, "beat", e.target.value)}
                      />
                    </label>
                    <label className="phrase-break">
                      <input
                        type="checkbox"
                        aria-label={`Start phrase at note ${i + 1}`}
                        checked={
                          i === 0 ||
                          (draft.some((c) => c.barStart)
                            ? !!cue.barStart
                            : i % 4 === 0)
                        }
                        disabled={i === 0}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setDraft((d) =>
                            d.map((c, j) => ({
                              ...c,
                              barStart:
                                j === i
                                  ? checked
                                  : d.some((n) => n.barStart)
                                    ? j === 0 || !!c.barStart
                                    : j % 4 === 0,
                            })),
                          );
                        }}
                      />
                      New phrase
                    </label>
                    <button
                      type="button"
                      aria-label={`Remove note ${i + 1}`}
                      onClick={() =>
                        setDraft((d) => d.filter((_, j) => j !== i))
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <div className="toolbar">
                <button
                  type="button"
                  onClick={() =>
                    setDraft((d) => [
                      ...d,
                      {
                        start: Math.round(time * 100) / 100,
                        end: Math.min(
                          duration,
                          Math.round((time + 0.5) * 100) / 100,
                        ),
                        note: "",
                        beat: "",
                      },
                    ])
                  }
                >
                  Add note at playback position
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (
                      await tools.command("media.score", {
                        id: asset.id,
                        cues: draft,
                      })
                    )
                      onSaved();
                  }}
                >
                  Save note timings
                </button>
              </div>
            </>
          )}
        </WorkflowDetails>
      )}
    </section>
  );
}
