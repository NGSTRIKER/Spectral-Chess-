import { BoardTheme, BotPreset, HistoryItem, PieceChar, TimeControlPreset } from '../types/chess';

export const BOARD_THEMES: BoardTheme[] = [
  { id: 'green', name: 'Chess.com Green', light: '#eeeed2', dark: '#769656', hlLight: '#f5f682', hlDark: '#b9ca43' },
  { id: 'walnut', name: 'Tournament Brown', light: '#f0d9b5', dark: '#b58863', hlLight: '#f7ec6e', hlDark: '#dac34b' },
  { id: 'icy', name: 'Icy Sea', light: '#dee3e6', dark: '#8ca2ad', hlLight: '#b8e0f6', hlDark: '#73b2d9' },
  { id: 'slate', name: 'Midnight Slate', light: '#d8dbe2', dark: '#6d7588', hlLight: '#f4e878', hlDark: '#b5af4c' },
];

export const TIME_CONTROLS: TimeControlPreset[] = [
  { id: '1+0', label: '1 min', category: 'Bullet', baseMs: 60_000, incMs: 0 },
  { id: '3+2', label: '3 | 2', category: 'Blitz', baseMs: 180_000, incMs: 2_000 },
  { id: '5+0', label: '5 min', category: 'Blitz', baseMs: 300_000, incMs: 0 },
  { id: '10+0', label: '10 min', category: 'Rapid', baseMs: 600_000, incMs: 0 },
  { id: 'unlimited', label: 'Unlimited', category: 'Unlimited', baseMs: 0, incMs: 0 },
];

export const BOT_PRESETS: BotPreset[] = [
  { id: 'casual', name: 'Spectral Casual', rating: '~2100', depth: 6, movetimeMs: 120, tagline: 'Fast blitz replies' },
  { id: 'club', name: 'Spectral Club', rating: '~2400', depth: 9, movetimeMs: 350, tagline: 'Balanced positional play' },
  { id: 'master', name: 'Spectral Master', rating: '~2600', depth: 12, movetimeMs: 850, tagline: 'Strong public test strength' },
  { id: 'gm', name: 'Spectral Max', rating: '~2700', depth: 15, movetimeMs: 1800, tagline: 'Full-depth tournament search' },
];

const START_COUNTS: Record<'Q' | 'R' | 'B' | 'N' | 'P', number> = {
  Q: 1, R: 2, B: 2, N: 2, P: 8,
};
const PIECE_VAL: Record<'Q' | 'R' | 'B' | 'N' | 'P', number> = {
  Q: 9, R: 5, B: 3, N: 3, P: 1,
};

export interface CapturedSummary {
  whiteCapturedBlack: ('q' | 'r' | 'b' | 'n' | 'p')[];
  blackCapturedWhite: ('Q' | 'R' | 'B' | 'N' | 'P')[];
  whiteAdvantage: number;
}

export function computeCaptured(squares: (PieceChar | null)[]): CapturedSummary {
  const wHave: Record<string, number> = { Q: 0, R: 0, B: 0, N: 0, P: 0 };
  const bHave: Record<string, number> = { Q: 0, R: 0, B: 0, N: 0, P: 0 };
  let wMat = 0;
  let bMat = 0;
  for (const ch of squares) {
    if (!ch || ch === 'K' || ch === 'k') continue;
    const up = ch.toUpperCase() as 'Q' | 'R' | 'B' | 'N' | 'P';
    if (ch === up) {
      wHave[up]++;
      wMat += PIECE_VAL[up];
    } else {
      bHave[up]++;
      bMat += PIECE_VAL[up];
    }
  }
  const order: ('Q' | 'R' | 'B' | 'N' | 'P')[] = ['Q', 'R', 'B', 'N', 'P'];
  const whiteCapturedBlack: ('q' | 'r' | 'b' | 'n' | 'p')[] = [];
  const blackCapturedWhite: ('Q' | 'R' | 'B' | 'N' | 'P')[] = [];
  for (const pt of order) {
    const missingB = Math.max(0, START_COUNTS[pt] - bHave[pt]);
    for (let i = 0; i < missingB; i++) whiteCapturedBlack.push(pt.toLowerCase() as 'q' | 'r' | 'b' | 'n' | 'p');
    const missingW = Math.max(0, START_COUNTS[pt] - wHave[pt]);
    for (let i = 0; i < missingW; i++) blackCapturedWhite.push(pt);
  }
  return {
    whiteCapturedBlack,
    blackCapturedWhite,
    whiteAdvantage: wMat - bMat,
  };
}

export function formatClock(ms: number): string {
  const clamped = Math.max(0, ms);
  if (clamped < 10_000) {
    const s = (clamped / 1000).toFixed(1);
    return `0:0${s}`.replace('0:010.0', '0:10.0');
  }
  const totalSec = Math.ceil(clamped / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatEvalDisplay(cp: number, mate: number | null): string {
  if (mate !== null && mate !== 0) {
    return (mate > 0 ? '+' : '-') + `M${Math.abs(mate)}`;
  }
  if (Math.abs(cp) >= 90000) {
    return cp > 0 ? '+M' : '-M';
  }
  const val = (cp / 100).toFixed(1);
  return cp >= 0 ? `+${val}` : val;
}

export function evalWinPercentWhite(cp: number, mate: number | null): number {
  if (mate !== null && mate !== 0) {
    return mate > 0 ? 96 : 4;
  }
  const prob = 1 / (1 + Math.exp(-cp / 400));
  return Math.max(4, Math.min(96, prob * 100));
}

export function buildPgn(history: HistoryItem[], whiteName: string, blackName: string, result: string): string {
  const lines = [
    `[Event "Spectral Chess Public Arena"]`,
    `[Site "Spectral Web (WASM)"]`,
    `[White "${whiteName}"]`,
    `[Black "${blackName}"]`,
    `[Result "${result}"]`,
    '',
  ];
  const tokens: string[] = [];
  for (let i = 0; i < history.length; i += 2) {
    const num = Math.floor(i / 2) + 1;
    const w = history[i]?.san ?? history[i]?.uci ?? '';
    const b = history[i + 1] ? ` ${history[i + 1].san ?? history[i + 1].uci}` : '';
    tokens.push(`${num}. ${w}${b}`);
  }
  tokens.push(result);
  lines.push(tokens.join(' '));
  return lines.join('\n');
}

export function applyHistoryUciSnapshot(
  squares: (PieceChar | null)[],
  uci: string,
): { squares: (PieceChar | null)[]; from: number; to: number } {
  const next = [...squares];
  const ff = uci.charCodeAt(0) - 97;
  const fr = parseInt(uci[1], 10) - 1;
  const tf = uci.charCodeAt(2) - 97;
  const tr = parseInt(uci[3], 10) - 1;
  const from = (fr << 3) | ff;
  const to = (tr << 3) | tf;
  const piece = next[from];
  next[from] = null;

  // Handle castling
  if ((piece === 'K' || piece === 'k') && Math.abs(tf - ff) === 2) {
    const rankBase = fr << 3;
    if (tf === 6) {
      next[rankBase | 5] = next[rankBase | 7];
      next[rankBase | 7] = null;
    } else if (tf === 2) {
      next[rankBase | 3] = next[rankBase | 0];
      next[rankBase | 0] = null;
    }
  }

  // Handle en passant
  if ((piece === 'P' || piece === 'p') && ff !== tf && !next[to]) {
    next[(fr << 3) | tf] = null;
  }

  const promo = uci[4];
  if (promo && piece) {
    const isWhite = piece === piece.toUpperCase();
    next[to] = (isWhite ? promo.toUpperCase() : promo.toLowerCase()) as PieceChar;
  } else {
    next[to] = piece;
  }
  return { squares: next, from, to };
}

export const START_SQUARES: (PieceChar | null)[] = (() => {
  const arr: (PieceChar | null)[] = new Array(64).fill(null);
  const backW: PieceChar[] = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
  const backB: PieceChar[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  for (let f = 0; f < 8; f++) {
    arr[f] = backW[f];
    arr[8 + f] = 'P';
    arr[48 + f] = 'p';
    arr[56 + f] = backB[f];
  }
  return arr;
})();
