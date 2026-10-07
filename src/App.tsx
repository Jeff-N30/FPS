import { useEffect, useState } from "react";
import { ALLOWED, CODES, MAX, PLAYERS, TEAMS, type Player } from "./data";
import TacticalNavModule from "./components/TacticalNavModule";

type Msg = { u: string; m: string; s?: boolean };
type Chan = "team" | "global";

const col = (h: number) => (h >= 3 ? "var(--grn)" : h === 2 ? "var(--amb)" : "var(--red)");

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

function PlayerList({ me, players }: { me: Player; players: Player[] }) {
  const others = players
    .filter((p) => p.n !== me.n)
    .sort((a, b) => Number(a.t !== me.t) - Number(b.t !== me.t));
  return (
    <section className="panel panel-roster">
      <div className="panel-hd">
        <div className="lbl">Roster</div>
        <div className="mini-tag mono">6 ONLINE</div>
      </div>
      {others.map((p) => (
        <div className="row" key={p.n}>
          <i className="sw" style={{ background: TEAMS[p.t] }} />
          <span className="nm mono">{p.n}</span>
          <div className="bar slim">
            <i style={{ width: `${(p.hp / MAX) * 100}%`, background: col(p.hp) }} />
          </div>
          <span className="mono hpv">{p.hp}</span>
        </div>
      ))}
    </section>
  );
}

function AttackInput({ onFire }: { onFire: (code: string) => string }) {
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  return (
    <section className="panel panel-fire">
      <div className="panel-hd">
        <div className="lbl">Objective Code</div>
        <div className="mini-tag mono">STRIKE AUTH</div>
      </div>
      <div className="code">
        <input
          className="mono"
          maxLength={6}
          placeholder="K7-4Q9"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <button
          onClick={() => {
            const r = onFire(code);
            setMsg(r);
            if (r.startsWith("✓")) setCode("");
          }}
        >
          FIRE
        </button>
      </div>
      <div className="hint mono">CODE FORMAT: A1B2C</div>
      <div className={`err feedbk ${msg.startsWith("✓") ? "ok" : ""}`}>{msg}</div>
    </section>
  );
}

function Chat({ me, chat, onSend }: { me: string; chat: Record<Chan, Msg[]>; onSend: (c: Chan, m: Msg) => void }) {
  const [ch, setCh] = useState<Chan>("team");
  const [text, setText] = useState("");
  const send = () => {
    if (!text.trim()) return;
    onSend(ch, { u: me, m: text.trim() });
    setText("");
  };
  const feed = chat[ch].slice(-3);
  return (
    <section className="panel panel-comms">
      <div className="seg">
        {(["team", "global"] as Chan[]).map((c) => (
          <div key={c} className={ch === c ? "on" : ""} onClick={() => setCh(c)}>
            {c === "team" ? "Team" : "Global"}
          </div>
        ))}
      </div>
      <button className="call">Radio ping</button>
      <div className="feed">
        {feed.map((c, i) => (
          <div key={i} className={`m ${c.s ? "s" : ""}`}>
            <b>{c.u}</b>
            {c.m}
          </div>
        ))}
      </div>
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

  if (!meName) return <Login onLogin={setMeName} />;
  const me = players.find((p) => p.n === meName)!;

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
        <PlayerList me={me} players={players} />
        <TacticalNavModule />
        <AttackInput onFire={fire} />
        <Chat me={me.n} chat={chat} onSend={send} />
      </div>
    </div>
  );
}
