import { useEffect, useRef, useState } from "react";
import { ALLOWED, CODES, MAX, PLAYERS, TEAMS, type Player } from "./data";
import TacticalNavModule from "./components/TacticalNavModule";
import CodeKeypad, { CODE_LEN } from "./components/CodeKeypad";
import RadioControls from "./components/RadioControls";

type Msg = { u: string; m: string; s?: boolean };
type Chan = "team" | "global";

const col = (h: number) => (h >= 3 ? "var(--grn)" : h === 2 ? "var(--amb)" : "var(--red)");

function useMedia(q: string) {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const h = () => setM(mq.matches);
    mq.addEventListener("change", h);
    h();
    return () => mq.removeEventListener("change", h);
  }, [q]);
  return m;
}

function Login({ onLogin }: { onLogin: (n: string) => void }) {
  const [v, setV] = useState("");
  const [err, setErr] = useState("");
  const go = () => {
    const n = v.trim().toUpperCase();
    if (ALLOWED.includes(n)) onLogin(n);
    else setErr("Callsign not on roster.");
  };
  return (
    <div id="login">
      <div className="login-wrap">
        <div className="hud-head">
          <span className="mono">SECURE LINK // OPS-NODE-07</span>
          <span className="signal" />
        </div>
        <div className="lbl mono">Operation access</div>
        <h1>Enter callsign</h1>
        <p className="sub">Authorized roster only.</p>
      </div>
      <input
        placeholder="CALLSIGN"
        autoCapitalize="characters"
        autoComplete="off"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && go()}
      />
      <div className="err">{err}</div>
      <button onClick={go}>Deploy</button>
      <div className="tiny mono">UTC 19:42:11 · GRID 48QF</div>
    </div>
  );
}

function Clock() {
  const [s, setS] = useState(720);
  useEffect(() => {
    const id = setInterval(() => setS((x) => Math.max(0, x - 1)), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="timer mono">
      T-{String(Math.floor(s / 60)).padStart(2, "0")}:{String(s % 60).padStart(2, "0")}
    </span>
  );
}

function HealthCard({ me }: { me: Player }) {
  const status = me.hp ? "Combat ready" : "Eliminated";
  return (
    <section className="panel panel-health">
      <div className="panel-hd">
        <div className="lbl">Operator</div>
        <div className="mini-tag mono">BIO {me.hp ? "GREEN" : "RED"}</div>
      </div>
      <div className="name-line">
        <h2>{me.n}</h2>
        <span className={`state ${me.hp ? "ok" : "danger"}`}>{status}</span>
      </div>
      <div className="hp-grid">
        <div className="hp-count mono">{me.hp}/{MAX}</div>
        <div className="hp-label">Armor plates</div>
      </div>
      <div className="bar thin">
        <i style={{ width: `${(me.hp / MAX) * 100}%`, background: col(me.hp) }} />
      </div>
      <div className="plates">
        {Array.from({ length: MAX }, (_, i) => (
          <span key={i} className={i < me.hp ? "" : "off"} />
        ))}
      </div>
    </section>
  );
}

function PlayerList({
  me,
  players,
  silent,
  onToggleSilent,
  talking,
}: {
  me: Player;
  players: Player[];
  silent: boolean;
  onToggleSilent: () => void;
  talking?: string;
}) {
  const others = players
    .filter((p) => p.n !== me.n)
    .sort((a, b) => Number(a.t !== me.t) - Number(b.t !== me.t));
  return (
    <section className={`panel panel-roster ${silent ? "silent-on" : ""}`}>
      <div className="panel-hd roster-hd">
        <div>
          <div className="lbl">Roster</div>
          <div className="mini-tag mono">6 ONLINE</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={silent}
          title="Silent mode: mute incoming chat and audio"
          className={`tac mute ${silent ? "on" : ""}`}
          onClick={onToggleSilent}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {silent ? (
              <path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
            ) : (
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
            )}
          </svg>
          <span className="mono">{silent ? "MUTED" : "MUTE"}</span>
        </button>
      </div>
      {others.map((p) => (
        <div className="row" key={p.n}>
          <i className="sw" style={{ background: TEAMS[p.t] }} />
          <span className="nm mono">
            {p.n}
            {!silent && talking === p.n && <span className="talk" />}
          </span>
          <div className="bar slim">
            <i style={{ width: `${(p.hp / MAX) * 100}%`, background: col(p.hp) }} />
          </div>
          <span className="mono hpv">{p.hp}</span>
        </div>
      ))}
    </section>
  );
}

function ObjectiveCode({ onFire }: { onFire: (code: string) => string }) {
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const padRef = useRef<HTMLDivElement>(null);

  const fire = () => {
    const r = onFire(code);
    setMsg(r);
    if (r.startsWith("✓")) {
      setCode("");
      setOpen(false);
    }
  };

  // Tap/click anywhere outside the code card / keypad closes the keypad.
  useEffect(() => {
    if (!open) return;
    const h = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || padRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", h);
    return () => document.removeEventListener("pointerdown", h);
  }, [open]);

  // Physical keyboard support (laptops): letters/digits, Backspace, Enter = fire, Esc = close.
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^[a-zA-Z0-9]$/.test(e.key)) {
        setCode((c) => (c.length < CODE_LEN ? c + e.key.toUpperCase() : c));
      } else if (e.key === "Backspace") {
        setCode((c) => c.slice(0, -1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        fire();
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [open, fire]);

  return (
    <>
      <section ref={panelRef} className="panel panel-fire">
        <div className="panel-hd">
          <div className="lbl">Objective Code</div>
          <div className="mini-tag mono">STRIKE AUTH</div>
        </div>
        <div
          className={`codebox ${open ? "open" : ""}`}
          style={{ gridTemplateColumns: `repeat(${CODE_LEN}, 1fr)` }}
          role="button"
          aria-label="objective code"
          onClick={() => setOpen((o) => !o)}
        >
          {Array.from({ length: CODE_LEN }, (_, i) => (
            <span key={i} className={`slot mono ${code[i] ? "fill" : ""} ${open && i === code.length ? "cur" : ""}`}>
              {code[i] ?? ""}
            </span>
          ))}
        </div>
        <button type="button" className="fire-btn" onMouseDown={(e) => e.preventDefault()} onClick={fire}>FIRE</button>
        <div className="hint mono">TAP BOX TO TYPE · A1B2C</div>
        <div className={`err feedbk ${msg.startsWith("✓") ? "ok" : ""}`}>{msg}</div>
      </section>
      {open && (
        <CodeKeypad
          padRef={padRef}
          onKey={(k) => setCode((c) => (c.length < CODE_LEN ? c + k : c))}
          onBack={() => setCode((c) => c.slice(0, -1))}
          onFire={fire}
        />
      )}
    </>
  );
}

function Chat({
  me,
  chat,
  onSend,
  silentAt,
}: {
  me: string;
  chat: Record<Chan, Msg[]>;
  onSend: (c: Chan, m: Msg) => void;
  silentAt: Record<Chan, number> | null;
}) {
  const [ch, setCh] = useState<Chan>("team");
  const [text, setText] = useState("");
  const send = () => {
    if (!text.trim()) return;
    onSend(ch, { u: me, m: text.trim() });
    setText("");
  };
  const wide = useMedia("(min-width: 900px) and (min-height: 520px)");
  const feed = chat[ch].slice(wide ? -25 : -3);
  const silent = silentAt !== null;
  const missed = silentAt ? chat[ch].slice(silentAt[ch]).filter((c) => c.u !== me).length : 0;
  return (
    <section className="panel panel-comms">
      <div className="comms-hd">
        <div className="seg">
        {(["team", "global"] as Chan[]).map((c) => (
          <div key={c} className={ch === c ? "on" : ""} onClick={() => setCh(c)}>
            {c === "team" ? "Team" : "Global"}
          </div>
        ))}
        </div>
        <RadioControls channel={ch === "team" ? "TEAM" : "ALL"} />
      </div>
      {silent ? (
        <div className="rx-muted mono">
          <b>RX MUTED</b>
          <span>CHAT + AUDIO BLOCKED · {missed} MISSED</span>
        </div>
      ) : (
        <div className="feed">
          {feed.map((c, i) => (
            <div key={i} className={`m ${c.s ? "s" : ""}`}>
              <b>{c.u}</b>
              {c.m}
            </div>
          ))}
        </div>
      )}
      <div className="chatin">
        <input placeholder="Message" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
        <button onClick={send}>Send</button>
      </div>
    </section>
  );
}

export default function App() {
  const [meName, setMeName] = useState<string | null>(null);
  const [players, setPlayers] = useState<Player[]>(PLAYERS);
  const [codes, setCodes] = useState<Record<string, string>>(CODES);
  const [chat, setChat] = useState<Record<Chan, Msg[]>>({
    team: [{ u: "VIPER", m: "Pushing alpha" }],
    global: [{ u: "SYSTEM", m: "Match live", s: true }],
  });

  const [silentAt, setSilentAt] = useState<Record<Chan, number> | null>(null);

  if (!meName) return <Login onLogin={setMeName} />;
  const me = players.find((p) => p.n === meName)!;

  const toggleSilent = () => setSilentAt((s) => (s ? null : { team: chat.team.length, global: chat.global.length }));

  const send = (c: Chan, m: Msg) => setChat((x) => ({ ...x, [c]: [...x[c], m] }));

  const fire = (raw: string) => {
    const c = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const target = codes[c];
    if (!target) return "✕ Invalid code";
    const tp = players.find((p) => p.n === target)!;
    if (tp.t === me.t) return "✕ Friendly";
    setPlayers((ps) => ps.map((p) => (p.n === target ? { ...p, hp: Math.max(0, p.hp - 1) } : p)));
    setCodes(({ [c]: _used, ...rest }) => rest);
    send("global", { u: "SYSTEM", m: `${me.n} hit ${target}`, s: true });
    return `✓ Hit confirmed: ${target}`;
  };

  return (
    <div id="app" role="application" aria-label="tactical ui">
      <header className="top">
        <div className="mission">
          <div className="tag mono">CLASSIFIED OP</div>
          <h1>OPERATION DUSTLINE</h1>
          <div className="meta mono">SECTOR B-12 · LAT 31.5708 N · LON 35.2034 E</div>
        </div>
        <div className="status-block">
          <span className="pill mono"><span className="dot" />LIVE</span>
          <Clock />
        </div>
      </header>
      <section className="warning mono">
        <span className="warn-tri" /> OBJECTIVE: HOLD ALPHA NODE · HOSTILES DETECTED EAST RIDGE
      </section>
      <div className="grid">
        <HealthCard me={me} />
        <PlayerList me={me} players={players} silent={silentAt !== null} onToggleSilent={toggleSilent} talking="VIPER" />
        <TacticalNavModule />
        <ObjectiveCode onFire={fire} />
        <Chat me={me.n} chat={chat} onSend={send} silentAt={silentAt} />
      </div>
    </div>
  );
}