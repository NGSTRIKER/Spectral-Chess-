export type PieceChar = 'P' | 'N' | 'B' | 'R' | 'Q' | 'K' | 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export interface LegalMove {
  uci: string;
  from: number;
  to: number;
  promo: 'q' | 'r' | 'b' | 'n' | null;
  capture: boolean;
}

export interface HistoryItem {
  uci: string;
  san: string;
}

export type GameStatus =
  | 'playing'
  | 'checkmate'
  | 'stalemate'
  | 'draw_50'
  | 'draw_insufficient'
  | 'draw_repetition';

export interface EngineState {
  fen: string;
  side_to_move: 'w' | 'b';
  status: GameStatus;
  in_check: boolean;
  squares: (PieceChar | null)[];
  legal_moves: LegalMove[];
  white_eval_cp: number;
  stm_eval_cp: number;
  reynolds_number: number;
  king_shock: number;
  net_pressure: number[];
  turbulence: number[];
  net_dam: number[];
  flow_x: number[];
  flow_y: number[];
  last_from: number | null;
  last_to: number | null;
  search_depth: number;
  search_nodes: number;
  search_nps: number;
  search_time_ms: number;
  search_score_cp: number;
  search_mate: number | null;
  pv: string[];
  pv_san: string[];
  history: HistoryItem[];
}

export type OverlayMode = 'none' | 'pressure' | 'flow' | 'turbulence' | 'dam';

export type BoardThemeId = 'green' | 'walnut' | 'icy' | 'slate';

export interface BoardTheme {
  id: BoardThemeId;
  name: string;
  light: string;
  dark: string;
  hlLight: string;
  hlDark: string;
}

export interface TimeControlPreset {
  id: string;
  label: string;
  category: 'Bullet' | 'Blitz' | 'Rapid' | 'Unlimited';
  baseMs: number;
  incMs: number;
}

export interface BotPreset {
  id: string;
  name: string;
  rating: string;
  depth: number;
  movetimeMs: number;
  tagline: string;
}

export interface ArrowAnnotation {
  from: number;
  to: number;
  color: string;
}

export interface Premove {
  from: number;
  to: number;
  promo?: 'q' | 'r' | 'b' | 'n';
}
