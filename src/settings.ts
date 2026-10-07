import { useEffect, useState } from "react";

export type Mode = "breakout" | "domination" | "deathmatch" | "battle_royale";
export type RosterVis = "none" | "team" | "all";
export type MapVis = "all" | "none";
export type ToolId = "bomb" | "nuke" | "drone";

// Zones are drawn on a 0..100 schematic board for now (real lat/lng comes with the DB + map).
export interface Zone { id: string; x: number; y: number; r: number; secs: number }
export interface Tool { id: ToolId; enabled: boolean; qty: number }

export interface Settings {
  mode: Mode;
  rosterVis: RosterVis;
  mapVis: MapVis;
  zones: Zone[];
  tools: Tool[];
}

export const MODES: { id: Mode; label: string; desc: string }[] = [
  { id: "breakout", label: "BREAKOUT", desc: "Secure the objective and extract" },
  { id: "domination", label: "DOMINATION", desc: "Capture and hold control points" },
  { id: "deathmatch", label: "DEATHMATCH", desc: "Most eliminations wins" },
  { id: "battle_royale", label: "BATTLE ROYALE", desc: "Shrinking zones, last one standing" },
];

export const TOOL_META: Record<ToolId, { label: string; desc: string }> = {
  bomb: { label: "BOMB", desc: "Area denial strike" },
  nuke: { label: "NUKE", desc: "Match-changing strike" },
  drone: { label: "DRONE", desc: "Recon sweep over the field" },
};

export const MAX_ZONES = 5;

export const fmtTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

export const DEFAULT_SETTINGS: Settings = {
  mode: "domination",
  rosterVis: "all",
  mapVis: "all",
  zones: [
    { id: "z1", x: 50, y: 50, r: 46, secs: 180 },
    { id: "z2", x: 56, y: 44, r: 30, secs: 120 },
    { id: "z3", x: 52, y: 48, r: 16, secs: 90 },
  ],
  tools: [
    { id: "bomb", enabled: true, qty: 1 },
    { id: "nuke", enabled: false, qty: 1 },
    { id: "drone", enabled: true, qty: 2 },
  ],
};

// Stand-in for the database: settings live in localStorage until Supabase exists.
const KEY = "fps.settings.v1";

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Settings>;
      return {
        ...DEFAULT_SETTINGS,
        ...p,
        tools: DEFAULT_SETTINGS.tools.map((t) => ({ ...t, ...(p.tools?.find((x) => x.id === t.id) ?? {}) })),
      };
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_SETTINGS;
}

export function useSettings() {
  const [s, setS] = useState<Settings>(load);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* ignore */
    }
  }, [s]);
  return [s, setS] as const;
}