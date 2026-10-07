import { useState, type PointerEvent as RPE } from "react";
import {
  DEFAULT_SETTINGS,
  MAX_ZONES,
  MODES,
  TOOL_META,
  fmtTime,
  type MapVis,
  type RosterVis,
  type Settings,
  type Tool,
  type ToolId,
  type Zone,
} from "../settings";

type Tab = "mode" | "intel" | "zones" | "arsenal";
const TABS: [Tab, string][] = [
  ["mode", "MODE"],
  ["intel", "INTEL"],
  ["zones", "ZONES"],
  ["arsenal", "ARSENAL"],
];

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
const GRID = Array.from({ length: 9 }, (_, i) => `M${(i + 1) * 10} 0V100M0 ${(i + 1) * 10}H100`).join("");

function Opt({ on, title, sub, onPick }: { on: boolean; title: string; sub: string; onPick: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={on} className={`opt ${on ? "on" : ""}`} onClick={onPick}>
      <span className="box" aria-hidden="true" />
      <span className="opt-txt">
        <b className="mono">{title}</b>
        <small>{sub}</small>
      </span>
    </button>
  );
}

function ToolIcon({ id }: { id: ToolId }) {
  if (id === "bomb")
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="10.5" cy="14" r="6.5" />
        <path d="M15 9.5l3-3M17.5 3.5v3h3" />
      </svg>
    );
  if (id === "nuke")
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="12" cy="12" r="2" />
        {[0, 120, 240].map((a) => (
          <path key={a} transform={`rotate(${a} 12 12)`} d="M12 3a9 9 0 0 1 7.79 4.5l-4.33 2.5A4 4 0 0 0 12 8z" />
        ))}
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="9" y="9" width="6" height="6" />
      <path d="M9 9L6 6M15 9l3-3M9 15l-3 3M15 15l3 3" />
      <circle cx="5" cy="5" r="2.5" />
      <circle cx="19" cy="5" r="2.5" />
      <circle cx="5" cy="19" r="2.5" />
      <circle cx="19" cy="19" r="2.5" />
    </svg>
  );
}

// Drag on the board: press = zone centre, drag = radius, release = commit.
function ZoneBoard({ zones, sel, onAdd }: { zones: Zone[]; sel: string | null; onAdd: (z: Pick<Zone, "x" | "y" | "r">) => void }) {
  const [draft, setDraft] = useState<Pick<Zone, "x" | "y" | "r"> | null>(null);

  const pt = (e: RPE<SVGSVGElement>) => {
    const m = e.currentTarget.getScreenCTM();
    if (!m) return { x: 50, y: 50 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: clamp(p.x, 0, 100), y: clamp(p.y, 0, 100) };
  };

  return (
    <div className="zone-board">
      <svg
        className="zone-svg"
        viewBox="0 0 100 100"
        aria-label="zone drawing board"
        onPointerDown={(e) => {
          if (zones.length >= MAX_ZONES) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setDraft({ ...pt(e), r: 0 });
        }}
        onPointerMove={(e) => {
          if (!draft) return;
          const p = pt(e);
          setDraft((d) => d && { ...d, r: clamp(Math.hypot(p.x - d.x, p.y - d.y), 0, 70) });
        }}
        onPointerUp={() => {
          if (draft && draft.r >= 4) onAdd(draft);
          setDraft(null);
        }}
        onPointerCancel={() => setDraft(null)}
      >
        <path className="zgrid" d={GRID} vectorEffect="non-scaling-stroke" />
        <rect className="zframe" x="0" y="0" width="100" height="100" vectorEffect="non-scaling-stroke" />
        {zones.map((z, i) => (
          <g key={z.id}>
            <circle className={`zc ${sel === z.id ? "sel" : ""}`} cx={z.x} cy={z.y} r={z.r} vectorEffect="non-scaling-stroke" />
            <text className="zt" x={z.x} y={z.y} textAnchor="middle" dominantBaseline="central">
              {i + 1}
            </text>
          </g>
        ))}
        {draft && <circle className="zdraft" cx={draft.x} cy={draft.y} r={draft.r} vectorEffect="non-scaling-stroke" />}
        {zones.length === 0 && !draft && (
          <text className="zhint" x="50" y="50" textAnchor="middle" dominantBaseline="central">
            DRAG TO DRAW ZONE 1
          </text>
        )}
      </svg>
    </div>
  );
}

type Props = {
  settings: Settings;
  onChange: (s: Settings) => void;
  onLogout: () => void;
};

// ROUGH SHAPE: values are stored locally (see settings.ts); wire to Supabase later.
export default function AdminPanel({ settings, onChange, onLogout }: Props) {
  const [tab, setTab] = useState<Tab>("mode");
  const [sel, setSel] = useState<string | null>(null);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...settings, [k]: v });
  const modeLabel = MODES.find((m) => m.id === settings.mode)?.label ?? "";
  const show = (t: Tab) => (tab === t ? "show" : "");

  const zones = settings.zones;
  const totalSecs = zones.reduce((a, z) => a + z.secs, 0);
  const addZone = (z: Pick<Zone, "x" | "y" | "r">) => {
    const nz: Zone = { id: `z${Date.now()}`, ...z, secs: 120 };
    set("zones", [...zones, nz]);
    setSel(nz.id);
  };
  const stepZone = (id: string, d: number) =>
    set("zones", zones.map((z) => (z.id === id ? { ...z, secs: clamp(z.secs + d, 15, 3600) } : z)));
  const delZone = (id: string) => set("zones", zones.filter((z) => z.id !== id));
  const patchTool = (id: ToolId, p: Partial<Tool>) => set("tools", settings.tools.map((t) => (t.id === id ? { ...t, ...p } : t)));

  const rosterOpts: [RosterVis, string, string][] = [
    ["none", "NOTHING", "No unit list, no HP, no status"],
    ["team", "TEAMMATES ONLY", "Squad HP and KIA status"],
    ["all", "ALL UNITS", "Everyone's HP and KIA status"],
  ];
  const mapOpts: [MapVis, string, string][] = [
    ["all", "ALL PLAYERS", "Tactical map enabled for everyone"],
    ["none", "NONE", "Map jammed for all players"],
  ];

  return (
    <div id="app" className="adm" role="application" aria-label="admin console">
      <header className="top">
        <div className="mission">
          <div className="tag mono">COMMAND CONSOLE</div>
          <h1>ADMIN</h1>
          <div className="meta mono">ACTIVE MODE · {modeLabel}</div>
        </div>
        <div className="adm-actions">
          <span className="pill mono"><span className="dot" />ONLINE</span>
          <button type="button" className="tac exit txt" onClick={onLogout}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M13 3h-2v10h2V3zm4.83 2.17l-1.42 1.42A6.92 6.92 0 0 1 19 12c0 3.87-3.13 7-7 7A6.995 6.995 0 0 1 7.58 6.58L6.17 5.17A8.932 8.932 0 0 0 3 12a9 9 0 0 0 18 0c0-2.74-1.23-5.18-3.17-6.83z" />
            </svg>
            <span className="mono">LOGOUT</span>
          </button>
        </div>
      </header>

      <nav className="adm-tabs" aria-label="sections">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" className={`adm-tab mono ${tab === id ? "on" : ""}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      <div className="adm-body">
        <div className="adm-col">
          <section className={`panel adm-sec ${show("mode")}`}>
            <div className="panel-hd">
              <div className="lbl">Game mode</div>
              <div className="mini-tag mono">SELECT ONE</div>
            </div>
            <div className="mode-grid" role="radiogroup" aria-label="game mode">
              {MODES.map((m, i) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={settings.mode === m.id}
                  className={`mcard ${settings.mode === m.id ? "on" : ""}`}
                  onClick={() => set("mode", m.id)}
                >
                  <span className="idx mono">{String(i + 1).padStart(2, "0")}</span>
                  <b className="mono">{m.label}</b>
                  <small>{m.desc}</small>
                </button>
              ))}
            </div>
          </section>

          <section className={`panel adm-sec ${show("intel")}`}>
            <div className="panel-hd">
              <div className="lbl">Intel visibility</div>
              <div className="mini-tag mono">PLAYER VIEW</div>
            </div>
            <div className="grp g3" role="radiogroup" aria-label="roster visibility">
              <div className="grp-t mono">Roster · who can be seen</div>
              <div className="opts">
                {rosterOpts.map(([v, t, s]) => (
                  <Opt key={v} on={settings.rosterVis === v} title={t} sub={s} onPick={() => set("rosterVis", v)} />
                ))}
              </div>
            </div>
            <div className="grp g2" role="radiogroup" aria-label="map visibility">
              <div className="grp-t mono">Map · who gets it</div>
              <div className="opts">
                {mapOpts.map(([v, t, s]) => (
                  <Opt key={v} on={settings.mapVis === v} title={t} sub={s} onPick={() => set("mapVis", v)} />
                ))}
              </div>
            </div>
          </section>
        </div>

        <section className={`panel adm-sec ${show("zones")}`}>
          <div className="panel-hd">
            <div className="lbl">Battle zones</div>
            <div className="zhd-r">
              <div className={`mini-tag mono ${settings.mode === "battle_royale" ? "ok" : ""}`}>
                {settings.mode === "battle_royale" ? `ACTIVE · ${zones.length}/${MAX_ZONES} · ${fmtTime(totalSecs)}` : `BR ONLY · ${zones.length}/${MAX_ZONES}`}
              </div>
              <button type="button" className="tac sm" onClick={() => { set("zones", []); setSel(null); }}>
                <span className="mono">CLEAR</span>
              </button>
            </div>
          </div>
          <ZoneBoard zones={zones} sel={sel} onAdd={addZone} />
          <div className="zone-list">
            {zones.map((z, i) => (
              <div key={z.id} className={`zcard ${sel === z.id ? "on" : ""}`} onClick={() => setSel(z.id)}>
                <b className="mono">Z{i + 1}</b>
                <div className="step" onClick={(e) => e.stopPropagation()}>
                  <button type="button" aria-label="less time" onClick={() => stepZone(z.id, -15)}>−</button>
                  <span className="mono">{fmtTime(z.secs)}</span>
                  <button type="button" aria-label="more time" onClick={() => stepZone(z.id, 15)}>+</button>
                </div>
                <button
                  type="button"
                  className="zdel"
                  aria-label="delete zone"
                  onClick={(e) => {
                    e.stopPropagation();
                    delZone(z.id);
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className={`panel adm-sec ${show("arsenal")}`}>
          <div className="panel-hd">
            <div className="lbl">Arsenal</div>
            <div className="mini-tag mono">{settings.tools.filter((t) => t.enabled).length} ENABLED</div>
          </div>
          <div className="tools">
            {settings.tools.map((t) => (
              <div key={t.id} className={`tool ${t.enabled ? "on" : "off"}`}>
                <div className="tool-ico"><ToolIcon id={t.id} /></div>
                <div className="tool-txt">
                  <b className="mono">{TOOL_META[t.id].label}</b>
                  <small>{TOOL_META[t.id].desc}</small>
                </div>
                <div className="tool-ctl">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={t.enabled}
                    aria-label={`${TOOL_META[t.id].label} enabled`}
                    className={`tgl ${t.enabled ? "on" : ""}`}
                    onClick={() => patchTool(t.id, { enabled: !t.enabled })}
                  />
                  <div className="qty" title="Allowance per player">
                    <button type="button" aria-label="fewer" disabled={!t.enabled} onClick={() => patchTool(t.id, { qty: clamp(t.qty - 1, 0, 9) })}>−</button>
                    <span className="mono">×{t.qty}</span>
                    <button type="button" aria-label="more" disabled={!t.enabled} onClick={() => patchTool(t.id, { qty: clamp(t.qty + 1, 0, 9) })}>+</button>
                  </div>
                </div>
              </div>
            ))}
            <div className="tool add mono">+ ADD TOOL · COMING SOON</div>
          </div>
        </section>
      </div>

      <footer className="adm-foot mono">
        <span><span className="dot" />AUTO-SAVED · LOCAL (DATABASE LATER)</span>
        <button type="button" className="tac sm" onClick={() => onChange(DEFAULT_SETTINGS)}>
          <span className="mono">RESET</span>
        </button>
      </footer>
    </div>
  );
}