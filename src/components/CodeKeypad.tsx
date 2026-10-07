import { useState, type RefObject } from "react";

// Number of characters in a balloon code. Change here if codes get longer.
export const CODE_LEN = 5;

const ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

type Props = {
  padRef: RefObject<HTMLDivElement>;
  onKey: (k: string) => void;
  onBack: () => void;
  onFire: () => void;
};

function Key({ label, cls = "", onPress, aria }: { label: string; cls?: string; onPress: () => void; aria?: string }) {
  return (
    <button type="button" className={`key ${cls}`} aria-label={aria ?? label} onClick={onPress}>
      {label}
    </button>
  );
}

export default function CodeKeypad({ padRef, onKey, onBack, onFire }: Props) {
  const [mode, setMode] = useState<"alpha" | "num">("alpha");

  return (
    <div ref={padRef} className="keypad" role="group" aria-label="code keypad" onMouseDown={(e) => e.preventDefault()}>
      {mode === "alpha" ? (
        <>
          <div className="kb-row">
            {ROWS[0].split("").map((k) => (
              <Key key={k} label={k} onPress={() => onKey(k)} />
            ))}
          </div>
          <div className="kb-row indent">
            {ROWS[1].split("").map((k) => (
              <Key key={k} label={k} onPress={() => onKey(k)} />
            ))}
          </div>
          <div className="kb-row">
            {ROWS[2].split("").map((k) => (
              <Key key={k} label={k} onPress={() => onKey(k)} />
            ))}
            <Key label="⌫" cls="fn wide" aria="backspace" onPress={onBack} />
          </div>
          <div className="kb-row">
            <Key label="123" cls="fn wide" aria="numbers" onPress={() => setMode("num")} />
            <Key label="FIRE" cls="go wide2" onPress={onFire} />
          </div>
        </>
      ) : (
        <div className="kb-num">
          {DIGITS.map((k) => (
            <Key key={k} label={k} onPress={() => onKey(k)} />
          ))}
          <Key label="ABC" cls="fn" aria="letters" onPress={() => setMode("alpha")} />
          <Key label="0" onPress={() => onKey("0")} />
          <Key label="⌫" cls="fn" aria="backspace" onPress={onBack} />
        </div>
      )}
    </div>
  );
}