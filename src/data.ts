export type Team = "BLUE" | "RED";
export interface Player { n: string; t: Team; hp: number; x: number; y: number }

export const MAX = 3;
export const ALLOWED = ["GHOST", "VIPER", "RAVEN", "TANK", "ECHO", "NOVA"];
export const TEAMS: Record<Team, string> = { BLUE: "#8fa25b", RED: "#c43d32" };

export const PLAYERS: Player[] = [
  { n: "GHOST", t: "BLUE", hp: 3, x: 30, y: 60 },
  { n: "VIPER", t: "BLUE", hp: 2, x: 45, y: 30 },
  { n: "NOVA", t: "BLUE", hp: 0, x: 20, y: 20 },
  { n: "RAVEN", t: "RED", hp: 3, x: 70, y: 50 },
  { n: "TANK", t: "RED", hp: 1, x: 80, y: 75 },
  { n: "ECHO", t: "RED", hp: 3, x: 60, y: 20 },
];

// Mock balloon codes -> owner. Replaced by the `balloons` table later.
export const CODES: Record<string, string> = { K74Q9: "RAVEN", M2X8P: "TANK" };
