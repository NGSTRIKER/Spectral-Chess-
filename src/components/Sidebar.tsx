import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Copy,
  Cpu,
  Flag,
  FlipVertical,
  Lightbulb,
  Play,
  RotateCcw,
  Sliders,
  Swords,
} from 'lucide-react';
import {
  BotPreset,
  EngineState,
  OverlayMode,
  TimeControlPreset,
} from '../types/chess';
import { BOT_PRESETS, TIME_CONTROLS, buildPgn, formatEvalDisplay } from '../utils/chessHelpers';

export type SidebarTab = 'play' | 'fluid' | 'setup';

interface SidebarProps {
  activeTab: SidebarTab;
  onTabChange: (t: SidebarTab) => void;
  state: EngineState;
  playerColor: 'w' | 'b';
  playBothSides: boolean;
  selectedBot: BotPreset;
  selectedTime: TimeControlPreset;
  onSelectBot: (b: BotPreset) => void;
  onSelectTime: (t: TimeControlPreset) => void;
  onStartNewGame: (color: 'w' | 'b' | 'random', bothSides?: boolean) => void;
  onResign: () => void;
  onUndo: () => void;
  onFlip: () => void;
  onHint: () => void;
  onLoadFen: (fen: string) => void;
  overlay: OverlayMode;
  onOverlayChange: (o: OverlayMode) => void;
  viewPly: number | null;
  onViewPlyChange: (ply: number | null) => void;
  gameResultStr: string | null;
  engineBusy: boolean;
}

export const Sidebar: React.FC<SidebarProps> = React.memo(({
  activeTab,
  onTabChange,
  state,
  playerColor,
  playBothSides,
  selectedBot,
  selectedTime,
  onSelectBot,
  onSelectTime,
  onStartNewGame,
  onResign,
  onUndo,
  onFlip,
  onHint,
  onLoadFen,
  overlay,
  onOverlayChange,
  viewPly,
  onViewPlyChange,
  gameResultStr,
  engineBusy,
}) => {
  const [fenDraft, setFenDraft] = useState(state.fen);
  const [copiedMsg, setCopiedMsg] = useState<string | null>(null);
  const [colorChoice, setColorChoice] = useState<'w' | 'b' | 'random'>(playerColor);
  const movesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setFenDraft(state.fen);
  }, [state.fen]);

  useEffect(() => {
    if (viewPly === null && movesRef.current) {
      movesRef.current.scrollTop = movesRef.current.scrollHeight;
    }
  }, [state.history.length, viewPly]);

  const totalPlies = state.history.length;
  const activePly = viewPly === null ? totalPlies : viewPly;

  const copyText = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMsg(label);
      setTimeout(() => setCopiedMsg(null), 1400);
    } catch {
      setCopiedMsg('Copy blocked');
      setTimeout(() => setCopiedMsg(null), 1400);
    }
  };

  const sharpBadge =
    state.reynolds_number > 220 ? 'Sharp' : state.reynolds_number > 95 ? 'Balanced' : 'Quiet';

  const whiteLabel = playBothSides ? 'Analysis (White)' : playerColor === 'w' ? 'You' : selectedBot.name;
  const blackLabel = playBothSides ? 'Analysis (Black)' : playerColor === 'b' ? 'You' : selectedBot.name;
  const pgnResult =
    state.status === 'checkmate'
      ? state.side_to_move === 'w'
        ? '0-1'
        : '1-0'
      : state.status !== 'playing'
        ? '1/2-1/2'
        : '*';

  return (
    <aside className="sidebar">
      {/* Top Chess.com Style Tab Bar */}
      <div className="sidebar-tabs">
        <button
          type="button"
          className={`tab-btn ${activeTab === 'play' ? 'active' : ''}`}
          onClick={() => onTabChange('play')}
        >
          <Swords size={15} />
          <span>Play</span>
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'fluid' ? 'active' : ''}`}
          onClick={() => onTabChange('fluid')}
        >
          <Activity size={15} />
          <span>Fluid Lab</span>
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'setup' ? 'active' : ''}`}
          onClick={() => onTabChange('setup')}
        >
          <Sliders size={15} />
          <span>Setup</span>
        </button>
      </div>

      {activeTab === 'play' && (
        <>
          {/* Compact Engine Status & Best Line Header */}
          <div className="telemetry-strip">
            <div className="telemetry-row">
              <span className="eval-badge">
                {formatEvalDisplay(state.search_score_cp, state.search_mate)}
              </span>
              <span className="telemetry-meta">
                d{state.search_depth || '-'} ·{' '}
                {state.search_nps ? `${Math.round(state.search_nps / 1000)}k nps` : 'WASM ready'}
              </span>
              <span className={`re-pill ${sharpBadge.toLowerCase()}`}>Re {state.reynolds_number}</span>
            </div>
            <div className="pv-line" title={state.pv_san.join(' ')}>
              {state.pv_san.length > 0 ? `PV: ${state.pv_san.slice(0, 7).join(' ')}` : 'Spectral v0.7.0 (D2Q17 Fluid-Wave WASM)'}
            </div>
          </div>

          {/* Scrollable SAN Move List */}
          <div className="moves-container" ref={movesRef}>
            {totalPlies === 0 ? (
              <div className="moves-empty">
                Make a move on the board or configure a new match below.
              </div>
            ) : (
              Array.from({ length: Math.ceil(totalPlies / 2) }).map((_, rowIdx) => {
                const wIdx = rowIdx * 2;
                const bIdx = wIdx + 1;
                const wItem = state.history[wIdx];
                const bItem = state.history[bIdx];
                return (
                  <div key={rowIdx} className={`move-row ${rowIdx % 2 === 1 ? 'alt' : ''}`}>
                    <span className="move-num">{rowIdx + 1}.</span>
                    <button
                      type="button"
                      className={`move-cell ${activePly === wIdx + 1 ? 'active' : ''}`}
                      onClick={() => onViewPlyChange(wIdx + 1 === totalPlies ? null : wIdx + 1)}
                    >
                      {wItem.san}
                    </button>
                    {bItem ? (
                      <button
                        type="button"
                        className={`move-cell ${activePly === bIdx + 1 ? 'active' : ''}`}
                        onClick={() => onViewPlyChange(bIdx + 1 === totalPlies ? null : bIdx + 1)}
                      >
                        {bItem.san}
                      </button>
                    ) : (
                      <span className="move-cell-empty" />
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Replay Navigation Bar (|< < > >|) */}
          <div className="nav-strip">
            <button
              type="button"
              className="nav-icon-btn"
              title="First move"
              disabled={activePly === 0}
              onClick={() => onViewPlyChange(0)}
            >
              <ChevronsLeft size={17} />
            </button>
            <button
              type="button"
              className="nav-icon-btn"
              title="Previous move (Left Arrow)"
              disabled={activePly === 0}
              onClick={() => onViewPlyChange(Math.max(0, activePly - 1))}
            >
              <ChevronLeft size={17} />
            </button>
            <button
              type="button"
              className="nav-icon-btn"
              title="Next move (Right Arrow)"
              disabled={activePly >= totalPlies}
              onClick={() => {
                const next = activePly + 1;
                onViewPlyChange(next >= totalPlies ? null : next);
              }}
            >
              <ChevronRight size={17} />
            </button>
            <button
              type="button"
              className="nav-icon-btn"
              title="Live position"
              disabled={viewPly === null}
              onClick={() => onViewPlyChange(null)}
            >
              <ChevronsRight size={17} />
            </button>
            <button
              type="button"
              className="nav-icon-btn"
              title="Analyze / Show Best Move Arrow"
              disabled={engineBusy || state.status !== 'playing'}
              onClick={onHint}
            >
              <Lightbulb size={16} />
            </button>
            <button type="button" className="nav-icon-btn" title="Flip Board (F)" onClick={onFlip}>
              <FlipVertical size={16} />
            </button>
          </div>

          {/* Match Setup & Live Controls Footer */}
          <div className="controls-panel">
            <div className="action-row-3">
              <button
                type="button"
                className="btn-sec"
                onClick={onUndo}
                disabled={engineBusy || totalPlies === 0}
              >
                <RotateCcw size={14} />
                <span>Undo</span>
              </button>
              <button
                type="button"
                className="btn-sec"
                onClick={onResign}
                disabled={state.status !== 'playing' || !!gameResultStr || playBothSides}
              >
                <Flag size={14} />
                <span>Resign</span>
              </button>
              <button
                type="button"
                className="btn-sec"
                onClick={() => copyText('PGN copied', buildPgn(state.history, whiteLabel, blackLabel, pgnResult))}
              >
                <Copy size={14} />
                <span>{copiedMsg === 'PGN copied' ? 'Copied!' : 'PGN'}</span>
              </button>
            </div>

            <div className="config-card">
              <div className="config-header">
                <span>Engine Strength</span>
                <span className="config-val">{selectedBot.rating}</span>
              </div>
              <div className="seg-grid-4">
                {BOT_PRESETS.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    className={`seg-btn ${selectedBot.id === b.id ? 'active' : ''}`}
                    onClick={() => onSelectBot(b)}
                  >
                    {b.name.replace('Spectral ', '')}
                  </button>
                ))}
              </div>

              <div className="config-header" style={{ marginTop: '8px' }}>
                <span>Time Control</span>
                <span className="config-val">{selectedTime.category}</span>
              </div>
              <div className="seg-grid-5">
                {TIME_CONTROLS.map((tc) => (
                  <button
                    key={tc.id}
                    type="button"
                    className={`seg-btn ${selectedTime.id === tc.id ? 'active' : ''}`}
                    onClick={() => onSelectTime(tc)}
                  >
                    {tc.label}
                  </button>
                ))}
              </div>

              <div className="play-cta-row">
                <div className="side-pills">
                  {(['w', 'random', 'b'] as const).map((side) => (
                    <button
                      key={side}
                      type="button"
                      className={`side-pill ${colorChoice === side ? 'active' : ''}`}
                      onClick={() => setColorChoice(side)}
                      title={side === 'w' ? 'Play White' : side === 'b' ? 'Play Black' : 'Random Side'}
                    >
                      {side === 'w' ? '♔' : side === 'b' ? '♚' : '◧'}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn-green-cta"
                  onClick={() => onStartNewGame(colorChoice, false)}
                >
                  <Play size={16} fill="currentColor" />
                  <span>{totalPlies > 0 ? 'New Game' : 'Play Spectral'}</span>
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === 'fluid' && (
        <div className="tab-body">
          <div className="section-label">D2Q17 Fluid Field Overlay</div>
          <div className="seg-grid-5">
            {(
              [
                ['none', 'None'],
                ['pressure', 'Press'],
                ['flow', 'Flow'],
                ['turbulence', 'Shock'],
                ['dam', 'Dam'],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                className={`seg-btn ${overlay === mode ? 'active' : ''}`}
                onClick={() => onOverlayChange(mode)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-label">Static Eval</div>
              <div className="metric-val">{formatEvalDisplay(state.white_eval_cp, null)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Search Score</div>
              <div className="metric-val">{formatEvalDisplay(state.search_score_cp, state.search_mate)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Reynolds (Re)</div>
              <div className="metric-val">{state.reynolds_number}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">King Shock</div>
              <div className="metric-val">{state.king_shock}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Search Depth</div>
              <div className="metric-val">{state.search_depth || '-'}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Nodes</div>
              <div className="metric-val">{state.search_nodes ? state.search_nodes.toLocaleString() : '-'}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">WASM Speed</div>
              <div className="metric-val">{state.search_nps ? `${Math.round(state.search_nps / 1000)}k/s` : '-'}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Time</div>
              <div className="metric-val">{state.search_time_ms ? `${state.search_time_ms}ms` : '-'}</div>
            </div>
          </div>

          <div className="fluid-legend">
            <div><strong>Pressure:</strong> Blue = White fluid dominance, Red = Black dominance.</div>
            <div><strong>Flow Vectors:</strong> Directional 2D fluid velocity <em>(Jx, Jy)</em> across empty squares.</div>
            <div><strong>Shock / Turbulence:</strong> Counter-current head-on clashes & vorticity curl.</div>
            <div><strong>Dam Gradient:</strong> Pawn/piece flux absorption barrier stress.</div>
          </div>

          <button
            type="button"
            className="btn-green-cta"
            style={{ width: '100%', marginTop: 'auto' }}
            disabled={engineBusy || state.status !== 'playing'}
            onClick={onHint}
          >
            <Cpu size={16} />
            <span>Run Deep Position Analysis</span>
          </button>
        </div>
      )}

      {activeTab === 'setup' && (
        <div className="tab-body">
          <div className="section-label">Analysis Sandbox (Play Both Sides)</div>
          <button
            type="button"
            className="btn-sec"
            style={{ width: '100%' }}
            onClick={() => onStartNewGame('w', true)}
          >
            Open Free Analysis Board (Pass &amp; Play / Test FEN)
          </button>

          <div className="section-label" style={{ marginTop: '14px' }}>Load FEN Position</div>
          <textarea
            className="fen-textarea"
            rows={3}
            value={fenDraft}
            onChange={(e) => setFenDraft(e.target.value)}
            spellCheck={false}
          />
          <div className="action-row-2">
            <button type="button" className="btn-green-cta" onClick={() => onLoadFen(fenDraft.trim())}>
              Load FEN
            </button>
            <button
              type="button"
              className="btn-sec"
              onClick={() => copyText('FEN copied', state.fen)}
            >
              <Copy size={14} />
              <span>{copiedMsg === 'FEN copied' ? 'Copied!' : 'Copy FEN'}</span>
            </button>
          </div>

          <div className="section-label" style={{ marginTop: '14px' }}>Quick Benchmark Positions</div>
          <div className="quick-fen-list">
            {[
              ['Starting Position', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'],
              ['Kiwipete Tactical Test', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1'],
              ['Queen + Bishop Battery', 'r1bq1rk1/pppp1pbp/2n2np1/4p3/3P4/2Q2N2/PP2BPPP/RNB2RK1 w - - 0 1'],
              ['Rook vs Pawn Endgame', '8/5pk1/R7/4P3/8/6P1/6K1/3r4 w - - 0 1'],
            ].map(([label, f]) => (
              <button
                key={label}
                type="button"
                className="btn-sec"
                style={{ justifyContent: 'flex-start' }}
                onClick={() => onLoadFen(f)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
});
