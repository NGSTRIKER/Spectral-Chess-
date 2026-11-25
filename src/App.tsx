import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Bot,
  Eye,
  EyeOff,
  Flame,
  Palette,
  Settings,
  Sliders,
  Swords,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { Board } from './components/Board';
import { PlayerBar } from './components/PlayerBar';
import { Sidebar, SidebarTab } from './components/Sidebar';
import { spectralEngine } from './engine/client';
import {
  BoardThemeId,
  BotPreset,
  EngineState,
  OverlayMode,
  PieceChar,
  Premove,
  TimeControlPreset,
} from './types/chess';
import {
  applyHistoryUciSnapshot,
  BOARD_THEMES,
  BOT_PRESETS,
  computeCaptured,
  evalWinPercentWhite,
  formatEvalDisplay,
  START_SQUARES,
  TIME_CONTROLS,
} from './utils/chessHelpers';
import { chessAudio } from './utils/sounds';

function playSoundForMove(state: EngineState, uci: string, wasCapture: boolean) {
  if (state.status !== 'playing') {
    chessAudio.playGameEnd();
    return;
  }
  if (state.in_check) {
    chessAudio.playCheck();
    return;
  }
  if (uci === 'e1g1' || uci === 'e1c1' || uci === 'e8g8' || uci === 'e8c8') {
    const movedPiece = state.last_to !== null ? state.squares[state.last_to] : null;
    if (movedPiece === 'K' || movedPiece === 'k') {
      chessAudio.playCastle();
      return;
    }
  }
  if (wasCapture) chessAudio.playCapture();
  else chessAudio.playMove();
}

export function App() {
  const [state, setState] = useState<EngineState | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [baseSquares, setBaseSquares] = useState<(PieceChar | null)[]>(START_SQUARES);

  const [activeTab, setActiveTab] = useState<SidebarTab>('play');
  const [playerColor, setPlayerColor] = useState<'w' | 'b'>('w');
  const [playBothSides, setPlayBothSides] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [selectedBot, setSelectedBot] = useState<BotPreset>(BOT_PRESETS[2]); // Master ~2600 default
  const [selectedTime, setSelectedTime] = useState<TimeControlPreset>(TIME_CONTROLS[2]); // 5 min Blitz

  const [themeId, setThemeId] = useState<BoardThemeId>('green');
  const [overlay, setOverlay] = useState<OverlayMode>('none');
  const [showEvalBar, setShowEvalBar] = useState(true);
  const [muted, setMuted] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [engineBusy, setEngineBusy] = useState(false);
  const [viewPly, setViewPly] = useState<number | null>(null);
  const [hintMoveUci, setHintMoveUci] = useState<string | null>(null);
  const [premove, setPremove] = useState<Premove | null>(null);
  const [gameResultStr, setGameResultStr] = useState<string | null>(null);
  const [modalDismissed, setModalDismissed] = useState(false);

  const [whiteClockMs, setWhiteClockMs] = useState<number>(TIME_CONTROLS[2].baseMs);
  const [blackClockMs, setBlackClockMs] = useState<number>(TIME_CONTROLS[2].baseMs);
  const clockActiveRef = useRef(false);
  const stateRef = useRef<EngineState | null>(null);
  stateRef.current = state;

  useEffect(() => {
    spectralEngine
      .init()
      .then((s) => {
        setState(s);
        setBaseSquares(s.squares);
      })
      .catch((e) => setLoadErr(e instanceof Error ? e.message : String(e)));
  }, []);

  // Derive game over result banner automatically
  useEffect(() => {
    if (!state) return;
    if (state.status === 'checkmate') {
      const winner = state.side_to_move === 'w' ? 'Black' : 'White';
      setGameResultStr(`${winner} Won by Checkmate`);
      clockActiveRef.current = false;
    } else if (state.status === 'stalemate') {
      setGameResultStr('Draw by Stalemate');
      clockActiveRef.current = false;
    } else if (state.status === 'draw_repetition') {
      setGameResultStr('Draw by Repetition');
      clockActiveRef.current = false;
    } else if (state.status === 'draw_50') {
      setGameResultStr('Draw by 50-Move Rule');
      clockActiveRef.current = false;
    } else if (state.status === 'draw_insufficient') {
      setGameResultStr('Draw by Insufficient Material');
      clockActiveRef.current = false;
    }
  }, [state]);

  // Live chess clock interval
  useEffect(() => {
    if (selectedTime.baseMs === 0 || playBothSides) return;
    let lastTick = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = now - lastTick;
      lastTick = now;
      const cur = stateRef.current;
      if (!cur || cur.status !== 'playing' || cur.history.length === 0 || !clockActiveRef.current) {
        return;
      }
      if (cur.side_to_move === 'w') {
        setWhiteClockMs((prev) => {
          const nxt = Math.max(0, prev - dt);
          if (nxt === 0) {
            clockActiveRef.current = false;
            setGameResultStr('Black Won on Time');
            chessAudio.playGameEnd();
          }
          return nxt;
        });
      } else {
        setBlackClockMs((prev) => {
          const nxt = Math.max(0, prev - dt);
          if (nxt === 0) {
            clockActiveRef.current = false;
            setGameResultStr('White Won on Time');
            chessAudio.playGameEnd();
          }
          return nxt;
        });
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [selectedTime.baseMs, playBothSides]);

  const runEngineTurn = useCallback(
    async (bot: BotPreset, tc: TimeControlPreset) => {
      const cur = stateRef.current;
      if (!cur || cur.status !== 'playing') return;
      setEngineBusy(true);
      setHintMoveUci(null);
      try {
        // Respect remaining engine clock when low
        const remMs = cur.side_to_move === 'w' ? whiteClockMs : blackClockMs;
        const budget =
          tc.baseMs > 0
            ? Math.max(40, Math.min(bot.movetimeMs, Math.floor(remMs / 16) + Math.floor(tc.incMs * 0.7)))
            : bot.movetimeMs;
        const prevCount = cur.squares.filter(Boolean).length;
        const next = await spectralEngine.engineMove(bot.depth, budget);
        const nextCount = next.squares.filter(Boolean).length;
        if (tc.baseMs > 0 && tc.incMs > 0 && next.status === 'playing') {
          if (cur.side_to_move === 'w') setWhiteClockMs((v) => v + tc.incMs);
          else setBlackClockMs((v) => v + tc.incMs);
        }
        setState(next);
        setViewPly(null);
        const lastUci = next.history[next.history.length - 1]?.uci || '';
        playSoundForMove(next, lastUci, nextCount < prevCount);
      } finally {
        setEngineBusy(false);
      }
    },
    [whiteClockMs, blackClockMs],
  );

  const handleUserMove = useCallback(
    async (uci: string) => {
      if (!stateRef.current || stateRef.current.status !== 'playing' || gameResultStr) return;
      setViewPly(null);
      setHintMoveUci(null);
      const prev = stateRef.current;
      const mvMeta = prev.legal_moves.find((m) => m.uci === uci);
      const next = await spectralEngine.makeMove(uci);
      if (next.history.length === prev.history.length) return; // illegal safeguard

      if (selectedTime.baseMs > 0 && !playBothSides) {
        clockActiveRef.current = true;
        if (selectedTime.incMs > 0 && next.status === 'playing') {
          if (prev.side_to_move === 'w') setWhiteClockMs((v) => v + selectedTime.incMs);
          else setBlackClockMs((v) => v + selectedTime.incMs);
        }
      }

      setState(next);
      playSoundForMove(next, uci, Boolean(mvMeta?.capture));

      if (!playBothSides && next.status === 'playing' && next.side_to_move !== playerColor) {
        setTimeout(() => {
          void runEngineTurn(selectedBot, selectedTime);
        }, 45);
      }
    },
    [gameResultStr, playBothSides, playerColor, selectedBot, selectedTime, runEngineTurn],
  );

  // Execute queued premove immediately after engine finishes moving
  useEffect(() => {
    if (!engineBusy && premove && state && state.status === 'playing' && !playBothSides && state.side_to_move === playerColor && !gameResultStr) {
      const match = state.legal_moves.find(
        (m) => m.from === premove.from && m.to === premove.to && (!m.promo || m.promo === (premove.promo || 'q')),
      );
      setPremove(null);
      if (match) {
        void handleUserMove(match.uci);
      }
    }
  }, [engineBusy, premove, state, playBothSides, playerColor, gameResultStr, handleUserMove]);

  const handleStartNewGame = async (choice: 'w' | 'b' | 'random', bothSides = false) => {
    const resolved: 'w' | 'b' = choice === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : choice;
    setEngineBusy(false);
    setPremove(null);
    setHintMoveUci(null);
    setViewPly(null);
    setGameResultStr(null);
    setModalDismissed(false);
    setPlayBothSides(bothSides);
    setPlayerColor(resolved);
    setFlipped(resolved === 'b');
    clockActiveRef.current = false;
    setWhiteClockMs(selectedTime.baseMs);
    setBlackClockMs(selectedTime.baseMs);

    const fresh = await spectralEngine.newGame('');
    setState(fresh);
    setBaseSquares(fresh.squares);

    if (!bothSides && resolved === 'b') {
      clockActiveRef.current = selectedTime.baseMs > 0;
      setTimeout(() => {
        void runEngineTurn(selectedBot, selectedTime);
      }, 60);
    }
  };

  const handleLoadFen = async (fen: string) => {
    if (!fen) return;
    setEngineBusy(false);
    setPremove(null);
    setHintMoveUci(null);
    setViewPly(null);
    setGameResultStr(null);
    setModalDismissed(false);
    clockActiveRef.current = false;
    setWhiteClockMs(selectedTime.baseMs);
    setBlackClockMs(selectedTime.baseMs);
    const loaded = await spectralEngine.newGame(fen);
    setState(loaded);
    setBaseSquares(loaded.squares);
  };

  const handleUndo = async () => {
    if (!state || engineBusy || state.history.length === 0) return;
    setPremove(null);
    setHintMoveUci(null);
    setViewPly(null);
    setGameResultStr(null);
    const plies = !playBothSides && state.side_to_move === playerColor && state.history.length >= 2 ? 2 : 1;
    const prev = await spectralEngine.undo(plies);
    setState(prev);
  };

  const handleHint = async () => {
    if (!state || engineBusy || state.status !== 'playing') return;
    setEngineBusy(true);
    try {
      const analyzed = await spectralEngine.analyze(11, 700);
      setState(analyzed);
      if (analyzed.pv.length > 0) setHintMoveUci(analyzed.pv[0]);
    } finally {
      setEngineBusy(false);
    }
  };

  // Keyboard shortcuts (Left/Right replay, F flip)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!state) return;
      const total = state.history.length;
      const cur = viewPly === null ? total : viewPly;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setViewPly(Math.max(0, cur - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const nxt = cur + 1;
        setViewPly(nxt >= total ? null : nxt);
      } else if (e.key === 'f' || e.key === 'F') {
        setFlipped((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, viewPly]);

  // Compute displayed board (live or historical replay)
  const displayed = useMemo(() => {
    if (!state) return null;
    if (viewPly === null || viewPly >= state.history.length) {
      return {
        squares: state.squares,
        lastFrom: state.last_from,
        lastTo: state.last_to,
        isLive: true,
      };
    }
    let sqs = baseSquares;
    let lf: number | null = null;
    let lt: number | null = null;
    for (let i = 0; i < viewPly; i++) {
      const res = applyHistoryUciSnapshot(sqs, state.history[i].uci);
      sqs = res.squares;
      lf = res.from;
      lt = res.to;
    }
    return { squares: sqs, lastFrom: lf, lastTo: lt, isLive: false };
  }, [state, viewPly, baseSquares]);

  const theme = BOARD_THEMES.find((t) => t.id === themeId) || BOARD_THEMES[0];

  if (loadErr) {
    return (
      <div className="loading-screen">
        <div className="loading-card">
          <h2>Failed to initialize Spectral WASM Engine</h2>
          <p>{loadErr}</p>
        </div>
      </div>
    );
  }

  if (!state || !displayed) {
    return (
      <div className="loading-screen">
        <div className="loading-card">
          <div className="spinner" />
          <h2>Loading Spectral v0.7.0…</h2>
          <p>Initializing SFLUID05 D2Q17 WebAssembly Engine</p>
        </div>
      </div>
    );
  }

  const captured = computeCaptured(displayed.squares);
  const topColor: 'w' | 'b' = flipped ? 'w' : 'b';
  const bottomColor: 'w' | 'b' = flipped ? 'b' : 'w';

  const topIsBot = !playBothSides && topColor !== playerColor;
  const bottomIsBot = !playBothSides && bottomColor !== playerColor;

  const evalWhitePct = evalWinPercentWhite(state.search_score_cp, state.search_mate);
  const evalLabel = formatEvalDisplay(state.search_score_cp, state.search_mate);

  return (
    <div className="app-shell">
      {/* Left Chess.com-style Slim Navigation Rail */}
      <nav className="nav-rail">
        <div className="brand-block">
          <div className="brand-emblem">
            <Flame size={20} />
          </div>
          <div className="brand-text">Spectral</div>
        </div>

        <button
          type="button"
          className={`rail-item ${activeTab === 'play' ? 'active' : ''}`}
          onClick={() => setActiveTab('play')}
        >
          <Swords size={18} />
          <span>Play</span>
        </button>

        <button
          type="button"
          className={`rail-item ${activeTab === 'fluid' ? 'active' : ''}`}
          onClick={() => setActiveTab('fluid')}
        >
          <Activity size={18} />
          <span>Fluid Lab</span>
        </button>

        <button
          type="button"
          className={`rail-item ${activeTab === 'setup' ? 'active' : ''}`}
          onClick={() => setActiveTab('setup')}
        >
          <Sliders size={18} />
          <span>Analysis</span>
        </button>

        <div className="rail-spacer" />

        <button
          type="button"
          className="rail-item"
          onClick={() => setShowEvalBar((v) => !v)}
          title="Toggle Evaluation Bar"
        >
          {showEvalBar ? <Eye size={18} /> : <EyeOff size={18} />}
          <span>Eval Bar</span>
        </button>

        <button
          type="button"
          className="rail-item"
          onClick={() => {
            const next = !muted;
            chessAudio.muted = next;
            setMuted(next);
          }}
        >
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          <span>{muted ? 'Muted' : 'Sound'}</span>
        </button>

        <button type="button" className="rail-item" onClick={() => setSettingsOpen(true)}>
          <Settings size={18} />
          <span>Theme</span>
        </button>
      </nav>

      {/* Main Arena Stage */}
      <main className="arena-main">
        <div className="board-stage">
          {showEvalBar && (
            <div className={`eval-bar ${flipped ? 'flipped' : ''}`} title={`Spectral Eval: ${evalLabel}`}>
              <div
                className="eval-fill-white"
                style={{ height: `${evalWhitePct.toFixed(1)}%` }}
              />
              <span className={`eval-score-label ${evalWhitePct >= 50 ? 'white-side' : 'black-side'}`}>
                {evalLabel}
              </span>
            </div>
          )}

          <div className="board-column">
            <PlayerBar
              name={topIsBot ? selectedBot.name : playBothSides ? (topColor === 'w' ? 'White' : 'Black') : 'You'}
              rating={topIsBot ? selectedBot.rating : undefined}
              isBot={topIsBot}
              isActiveTurn={state.status === 'playing' && !gameResultStr && state.side_to_move === topColor}
              isThinking={engineBusy && topIsBot}
              capturedPieces={topColor === 'w' ? captured.whiteCapturedBlack : captured.blackCapturedWhite}
              materialAdv={topColor === 'w' ? captured.whiteAdvantage : -captured.whiteAdvantage}
              clockMs={topColor === 'w' ? whiteClockMs : blackClockMs}
              unlimitedTime={selectedTime.baseMs === 0 || playBothSides}
            />

            <div className="board-relative-box">
              <Board
                squares={displayed.squares}
                legalMoves={state.legal_moves}
                sideToMove={state.side_to_move}
                playerColor={playerColor}
                playBothSides={playBothSides}
                flipped={flipped}
                interactive={displayed.isLive && state.status === 'playing' && !gameResultStr}
                engineBusy={engineBusy}
                inCheck={displayed.isLive && state.in_check}
                lastFrom={displayed.lastFrom}
                lastTo={displayed.lastTo}
                theme={theme}
                overlay={overlay}
                netPressure={state.net_pressure}
                turbulence={state.turbulence}
                netDam={state.net_dam}
                flowX={state.flow_x}
                flowY={state.flow_y}
                hintMoveUci={hintMoveUci}
                premove={premove}
                onSetPremove={setPremove}
                onMakeMove={(uci) => void handleUserMove(uci)}
              />

              {!displayed.isLive && (
                <button
                  type="button"
                  className="live-banner-btn"
                  onClick={() => setViewPly(null)}
                >
                  Viewing move {viewPly} — Click to return to live position
                </button>
              )}

              {gameResultStr && !modalDismissed && (
                <div className="gameover-modal-wrap">
                  <div className="gameover-modal">
                    <button
                      type="button"
                      className="modal-close"
                      onClick={() => setModalDismissed(true)}
                      aria-label="Close"
                    >
                      <X size={16} />
                    </button>
                    <div className="modal-icon">
                      <Bot size={26} />
                    </div>
                    <h2 className="modal-title">{gameResultStr}</h2>
                    <p className="modal-sub">
                      {state.history.length} plies played · Spectral v0.7.0 ({selectedBot.rating})
                    </p>
                    <div className="modal-actions">
                      <button
                        type="button"
                        className="btn-green-cta"
                        onClick={() => void handleStartNewGame(playerColor, false)}
                      >
                        Rematch
                      </button>
                      <button
                        type="button"
                        className="btn-sec"
                        onClick={() => void handleStartNewGame(playerColor === 'w' ? 'b' : 'w', false)}
                      >
                        Swap Sides
                      </button>
                      <button
                        type="button"
                        className="btn-sec"
                        onClick={() => setModalDismissed(true)}
                      >
                        Review Board
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <PlayerBar
              name={bottomIsBot ? selectedBot.name : playBothSides ? (bottomColor === 'w' ? 'White' : 'Black') : 'You'}
              rating={bottomIsBot ? selectedBot.rating : undefined}
              isBot={bottomIsBot}
              isActiveTurn={state.status === 'playing' && !gameResultStr && state.side_to_move === bottomColor}
              isThinking={engineBusy && bottomIsBot}
              capturedPieces={bottomColor === 'w' ? captured.whiteCapturedBlack : captured.blackCapturedWhite}
              materialAdv={bottomColor === 'w' ? captured.whiteAdvantage : -captured.whiteAdvantage}
              clockMs={bottomColor === 'w' ? whiteClockMs : blackClockMs}
              unlimitedTime={selectedTime.baseMs === 0 || playBothSides}
            />
          </div>
        </div>

        <Sidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          state={state}
          playerColor={playerColor}
          playBothSides={playBothSides}
          selectedBot={selectedBot}
          selectedTime={selectedTime}
          onSelectBot={setSelectedBot}
          onSelectTime={(tc) => {
            setSelectedTime(tc);
            if (state.history.length === 0) {
              setWhiteClockMs(tc.baseMs);
              setBlackClockMs(tc.baseMs);
            }
          }}
          onStartNewGame={(c, b) => void handleStartNewGame(c, b)}
          onResign={() => {
            if (state.status !== 'playing' || gameResultStr) return;
            clockActiveRef.current = false;
            setGameResultStr(playerColor === 'w' ? 'Black Won by Resignation' : 'White Won by Resignation');
            chessAudio.playGameEnd();
          }}
          onUndo={() => void handleUndo()}
          onFlip={() => setFlipped((f) => !f)}
          onHint={() => void handleHint()}
          onLoadFen={(f) => void handleLoadFen(f)}
          overlay={overlay}
          onOverlayChange={setOverlay}
          viewPly={viewPly}
          onViewPlyChange={setViewPly}
          gameResultStr={gameResultStr}
          engineBusy={engineBusy}
        />
      </main>

      {/* Theme Picker Modal */}
      {settingsOpen && (
        <div className="gameover-modal-wrap" onClick={() => setSettingsOpen(false)}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="settings-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Palette size={18} />
                <strong>Board Theme</strong>
              </div>
              <button type="button" className="modal-close" onClick={() => setSettingsOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="theme-grid">
              {BOARD_THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`theme-card ${themeId === t.id ? 'active' : ''}`}
                  onClick={() => setThemeId(t.id)}
                >
                  <div className="theme-preview">
                    <span style={{ background: t.light }} />
                    <span style={{ background: t.dark }} />
                    <span style={{ background: t.dark }} />
                    <span style={{ background: t.light }} />
                  </div>
                  <span>{t.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
