import { useEffect, useState } from "react";

type Props = {
  channel: string; // "TEAM" | "ALL"
};

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

// DESIGN ONLY: no audio yet. State is local so the UI can be tried out.
// Two compact corner keys: PTT (hold) and LINE (latch, stays connected like a call).
export default function RadioControls({ channel }: Props) {
  const [tx, setTx] = useState(false);
  const [line, setLine] = useState(false);
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    if (!line) {
      setSecs(0);
      return;
    }
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [line]);

  // Desktop: hold SPACE to talk (ignored while typing in a field).
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || isTyping(e.target)) return;
      e.preventDefault();
      setTx(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space" || isTyping(e.target)) return;
      e.preventDefault();
      setTx(false);
    };
    const off = () => setTx(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", off);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", off);
    };
  }, []);

  return (
    <div className="radio">
      <button
        type="button"
        className={`tac ptt ${tx ? "tx" : ""}`}
        aria-pressed={tx}
        title={`Hold to talk · ${channel} channel · hold Space`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setTx(true);
        }}
        onPointerUp={() => setTx(false)}
        onPointerCancel={() => setTx(false)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11z" />
        </svg>
        <span className="mono">{tx ? "TX" : "PTT"}</span>
      </button>

      <button
        type="button"
        className={`tac line ${line ? "on" : ""}`}
        aria-pressed={line}
        title={line ? "Hang up" : "Open line (stay connected)"}
        onClick={() => setLine((l) => !l)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1.02l-2.2 2.2z" />
        </svg>
        <span className="mono">{line ? fmt(secs) : "LINE"}</span>
      </button>
    </div>
  );
}