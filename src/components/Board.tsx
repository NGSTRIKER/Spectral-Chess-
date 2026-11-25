import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowAnnotation,
  BoardTheme,
  LegalMove,
  OverlayMode,
  PieceChar,
  Premove,
} from '../types/chess';
import { PieceSvg } from './Pieces';

interface BoardProps {
  squares: (PieceChar | null)[];
  legalMoves: LegalMove[];
  sideToMove: 'w' | 'b';
  playerColor: 'w' | 'b';
  playBothSides: boolean;
  flipped: boolean;
  interactive: boolean;
  engineBusy: boolean;
  inCheck: boolean;
  lastFrom: number | null;
  lastTo: number | null;
  theme: BoardTheme;
  overlay: OverlayMode;
  netPressure: number[];
  turbulence: number[];
  netDam: number[];
  flowX: number[];
  flowY: number[];
  hintMoveUci: string | null;
  premove: Premove | null;
  onSetPremove: (p: Premove | null) => void;
  onMakeMove: (uci: string) => void;
}

interface PendingPromo {
  from: number;
  to: number;
  color: 'w' | 'b';
  isPremove: boolean;
}

interface DragActive {
  piece: PieceChar;
  fromSq: number;
  startX: number;
  startY: number;
  wasSelected: boolean;
  moved: boolean;
  hoverSq: number | null;
}

function squareToPercent(sq: number, flipped: boolean): { cx: number; cy: number } {
  const f = sq & 7;
  const r = sq >> 3;
  const col = flipped ? 7 - f : f;
  const row = flipped ? r : 7 - r;
  return { cx: col * 12.5 + 6.25, cy: row * 12.5 + 6.25 };
}

function uciSquareToIndex(sqStr: string): number {
  const f = sqStr.charCodeAt(0) - 97;
  const r = parseInt(sqStr[1], 10) - 1;
  return (r << 3) | f;
}

export const Board: React.FC<BoardProps> = React.memo(
  ({
    squares,
    legalMoves,
    sideToMove,
    playerColor,
    playBothSides,
    flipped,
    interactive,
    engineBusy,
    inCheck,
    lastFrom,
    lastTo,
    theme,
    overlay,
    netPressure,
    turbulence,
    netDam,
    flowX,
    flowY,
    hintMoveUci,
    premove,
    onSetPremove,
    onMakeMove,
  }) => {
    const boardRef = useRef<HTMLDivElement | null>(null);
    const ghostRef = useRef<HTMLDivElement | null>(null);
    const boardRectRef = useRef<DOMRect | null>(null);

    const [selectedSq, setSelectedSq] = useState<number | null>(null);
    const [dragVisual, setDragVisual] = useState<{
      piece: PieceChar;
      fromSq: number;
      hoverSq: number | null;
    } | null>(null);
    const dragRef = useRef<DragActive | null>(null);

    const [pendingPromo, setPendingPromo] = useState<PendingPromo | null>(null);
    const [sqHighlights, setSqHighlights] = useState<Record<number, string>>({});
    const [arrows, setArrows] = useState<ArrowAnnotation[]>([]);
    const [arrowDraft, setArrowDraft] = useState<{
      from: number;
      to: number;
      color: string;
    } | null>(null);
    const arrowDraftRef = useRef<{ from: number; to: number; color: string } | null>(null);

    const canActTurn = interactive && !engineBusy && (playBothSides || sideToMove === playerColor);
    const canPremoveNow = interactive && engineBusy && !playBothSides && sideToMove !== playerColor;

    const latestRef = useRef({
      canActTurn,
      canPremoveNow,
      legalMoves,
      sideToMove,
      playerColor,
      squares,
      flipped,
      selectedSq,
      onMakeMove,
      onSetPremove,
    });
    latestRef.current = {
      canActTurn,
      canPremoveNow,
      legalMoves,
      sideToMove,
      playerColor,
      squares,
      flipped,
      selectedSq,
      onMakeMove,
      onSetPremove,
    };

    const clientToSquare = useCallback((clientX: number, clientY: number): number | null => {
      const rect = boardRectRef.current || boardRef.current?.getBoundingClientRect() || null;
      if (!rect) return null;
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
        return null;
      }
      const col = Math.min(7, Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * 8)));
      const row = Math.min(7, Math.max(0, Math.floor(((clientY - rect.top) / rect.height) * 8)));
      const flp = latestRef.current.flipped;
      const file = flp ? 7 - col : col;
      const rank = flp ? row : 7 - row;
      return (rank << 3) | file;
    }, []);

    useEffect(() => {
      setSelectedSq(null);
      setPendingPromo(null);
    }, [lastFrom, lastTo, interactive]);

    const trySubmitMove = useCallback((from: number, to: number): boolean => {
      const cur = latestRef.current;
      if (cur.canActTurn) {
        const candidates = cur.legalMoves.filter((m) => m.from === from && m.to === to);
        if (candidates.length === 0) return false;
        if (candidates.length > 1 && candidates.some((c) => c.promo)) {
          setPendingPromo({ from, to, color: cur.sideToMove, isPremove: false });
          return true;
        }
        cur.onMakeMove(candidates[0].uci);
        setSelectedSq(null);
        setSqHighlights({});
        setArrows([]);
        return true;
      }
      if (cur.canPremoveNow && from !== to) {
        const piece = cur.squares[from];
        const isMine =
          piece &&
          (cur.playerColor === 'w' ? piece === piece.toUpperCase() : piece === piece.toLowerCase());
        if (isMine) {
          const rankTo = to >> 3;
          const isPawnPromo = (piece === 'P' && rankTo === 7) || (piece === 'p' && rankTo === 0);
          if (isPawnPromo) {
            setPendingPromo({ from, to, color: cur.playerColor, isPremove: true });
          } else {
            cur.onSetPremove({ from, to });
          }
          setSelectedSq(null);
          return true;
        }
      }
      return false;
    }, []);

    // Direct DOM transform during drag — zero React re-renders per pixel!
    useEffect(() => {
      const onMove = (e: PointerEvent) => {
        const d = dragRef.current;
        if (d) {
          if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 5) {
            d.moved = true;
            const sqNow = clientToSquare(e.clientX, e.clientY);
            d.hoverSq = sqNow;
            setDragVisual({ piece: d.piece, fromSq: d.fromSq, hoverSq: sqNow });
          }
          if (d.moved) {
            if (ghostRef.current) {
              ghostRef.current.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0) translate(-50%, -55%)`;
            }
            const sqNow = clientToSquare(e.clientX, e.clientY);
            if (sqNow !== d.hoverSq) {
              d.hoverSq = sqNow;
              setDragVisual({ piece: d.piece, fromSq: d.fromSq, hoverSq: sqNow });
            }
          }
          return;
        }

        const ad = arrowDraftRef.current;
        if (ad) {
          const sq = clientToSquare(e.clientX, e.clientY);
          if (sq !== null && sq !== ad.to) {
            ad.to = sq;
            setArrowDraft({ ...ad });
          }
        }
      };

      const onUp = (e: PointerEvent) => {
        const d = dragRef.current;
        if (d) {
          const targetSq = clientToSquare(e.clientX, e.clientY);
          if (targetSq !== null && targetSq !== d.fromSq) {
            const ok = trySubmitMove(d.fromSq, targetSq);
            if (!ok && latestRef.current.selectedSq === d.fromSq) {
              setSelectedSq(null);
            }
          } else if (!d.moved) {
            if (d.wasSelected) setSelectedSq(null);
          } else if (targetSq === d.fromSq) {
            setSelectedSq(null);
          }
          dragRef.current = null;
          boardRectRef.current = null;
          setDragVisual(null);
          return;
        }

        const ad = arrowDraftRef.current;
        if (ad) {
          const endSq = clientToSquare(e.clientX, e.clientY);
          if (endSq !== null) {
            if (endSq === ad.from) {
              setSqHighlights((prev) => {
                const next = { ...prev };
                if (next[endSq] === ad.color) delete next[endSq];
                else next[endSq] = ad.color;
                return next;
              });
            } else {
              setArrows((prev) => {
                const exists = prev.find((a) => a.from === ad.from && a.to === endSq);
                if (exists) {
                  return prev.filter((a) => !(a.from === ad.from && a.to === endSq));
                }
                return [...prev, { from: ad.from, to: endSq, color: ad.color }];
              });
            }
          }
          arrowDraftRef.current = null;
          boardRectRef.current = null;
          setArrowDraft(null);
        }
      };

      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('pointerup', onUp);
      return () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
    }, [clientToSquare, trySubmitMove]);

    // Sync ghost initial coordinates as soon as dragVisual mounts
    useEffect(() => {
      if (dragVisual && ghostRef.current && dragRef.current) {
        const d = dragRef.current;
        ghostRef.current.style.transform = `translate3d(${d.startX}px, ${d.startY}px, 0) translate(-50%, -55%)`;
      }
    }, [dragVisual?.fromSq]);

    const handlePointerDown = (sq: number, e: React.PointerEvent) => {
      if (boardRef.current) {
        boardRectRef.current = boardRef.current.getBoundingClientRect();
      }
      if (e.button === 2) {
        e.preventDefault();
        if (premove) onSetPremove(null);
        const color = e.shiftKey
          ? 'rgba(235, 97, 80, 0.82)'
          : e.ctrlKey || e.metaKey
            ? 'rgba(77, 166, 255, 0.82)'
            : e.altKey
              ? 'rgba(255, 170, 0, 0.85)'
              : 'rgba(21, 120, 27, 0.82)';
        const draft = { from: sq, to: sq, color };
        arrowDraftRef.current = draft;
        setArrowDraft(draft);
        return;
      }
      if (e.button !== 0) return;

      if (Object.keys(sqHighlights).length > 0 || arrows.length > 0) {
        setSqHighlights({});
        setArrows([]);
      }

      if (pendingPromo) {
        setPendingPromo(null);
        return;
      }

      if (selectedSq !== null && selectedSq !== sq) {
        if (trySubmitMove(selectedSq, sq)) return;
      }

      const piece = squares[sq];
      const allowedColor = canActTurn
        ? playBothSides
          ? sideToMove
          : playerColor
        : canPremoveNow
          ? playerColor
          : null;

      if (piece && allowedColor) {
        const isMine =
          allowedColor === 'w' ? piece === piece.toUpperCase() : piece === piece.toLowerCase();
        if (isMine) {
          if (premove) onSetPremove(null);
          const wasSelected = selectedSq === sq;
          setSelectedSq(sq);
          dragRef.current = {
            piece,
            fromSq: sq,
            startX: e.clientX,
            startY: e.clientY,
            wasSelected,
            moved: false,
            hoverSq: sq,
          };
          return;
        }
      }
      setSelectedSq(null);
    };

    const targetMovesBySq = useMemo(() => {
      const map: Record<number, LegalMove> = {};
      if (selectedSq !== null && canActTurn) {
        for (const m of legalMoves) {
          if (m.from === selectedSq) map[m.to] = m;
        }
      }
      return map;
    }, [selectedSq, canActTurn, legalMoves]);

    const getHeatBg = (sq: number): string => {
      if (overlay === 'none') return 'transparent';
      if (overlay === 'pressure' || overlay === 'flow') {
        const v = netPressure[sq] || 0;
        const scale = overlay === 'flow' ? 0.36 : 0.54;
        const a = Math.min(Math.abs(v) / 140, 1) * scale;
        if (v > 8) return `rgba(59, 130, 246, ${a.toFixed(2)})`;
        if (v < -8) return `rgba(239, 68, 68, ${a.toFixed(2)})`;
      } else if (overlay === 'turbulence') {
        const t = turbulence[sq] || 0;
        if (t > 10) return `rgba(234, 179, 8, ${(Math.min(t / 200, 1) * 0.65).toFixed(2)})`;
      } else if (overlay === 'dam') {
        const d = netDam[sq] || 0;
        if (Math.abs(d) > 5) return `rgba(168, 85, 247, ${(Math.min(Math.abs(d) / 80, 1) * 0.65).toFixed(2)})`;
      }
      return 'transparent';
    };

    const ranks = flipped ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
    const files = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

    const renderArrowList: ArrowAnnotation[] = [...arrows];
    if (hintMoveUci && hintMoveUci.length >= 4) {
      renderArrowList.push({
        from: uciSquareToIndex(hintMoveUci.slice(0, 2)),
        to: uciSquareToIndex(hintMoveUci.slice(2, 4)),
        color: 'rgba(129, 182, 76, 0.88)',
      });
    }
    if (arrowDraft && arrowDraft.from !== arrowDraft.to) {
      renderArrowList.push({ from: arrowDraft.from, to: arrowDraft.to, color: arrowDraft.color });
    }

    return (
      <div className="board-wrap" ref={boardRef} onContextMenu={(e) => e.preventDefault()}>
        {ranks.map((r) =>
          files.map((f) => {
            const sq = (r << 3) | f;
            const isLight = ((r + f) & 1) === 1;
            const isHighlighted = sq === selectedSq || sq === lastFrom || sq === lastTo;
            const isPremoveSq = premove && (sq === premove.from || sq === premove.to);
            const piece = squares[sq];
            const isKingCheck =
              inCheck &&
              ((sideToMove === 'w' && piece === 'K') || (sideToMove === 'b' && piece === 'k'));
            const bg = isHighlighted
              ? isLight
                ? theme.hlLight
                : theme.hlDark
              : isLight
                ? theme.light
                : theme.dark;
            const coordColor = isLight ? theme.dark : theme.light;
            const target = targetMovesBySq[sq];
            const isDraggingSource = dragVisual && dragVisual.fromSq === sq;
            const isDragHover = dragVisual && dragVisual.hoverSq === sq;

            return (
              <div
                key={sq}
                className={`sq ${isDragHover ? 'drag-hover' : ''}`}
                style={{ backgroundColor: bg }}
                onPointerDown={(e) => handlePointerDown(sq, e)}
              >
                {isPremoveSq && <div className="sq-premove-overlay" />}
                {sqHighlights[sq] && (
                  <div
                    className="sq-user-hl"
                    style={{
                      backgroundColor:
                        sqHighlights[sq] === 'rgba(21, 120, 27, 0.82)'
                          ? 'rgba(235, 97, 80, 0.65)'
                          : sqHighlights[sq],
                    }}
                  />
                )}
                {isKingCheck && <div className="sq-check-glow" />}

                {overlay !== 'none' && (
                  <div className="heat-layer" style={{ backgroundColor: getHeatBg(sq) }} />
                )}

                {overlay === 'flow' &&
                  (() => {
                    const fx = flipped ? -(flowX[sq] || 0) : flowX[sq] || 0;
                    const fy = flipped ? flowY[sq] || 0 : -(flowY[sq] || 0);
                    const mag = Math.hypot(fx, fy);
                    if (mag > 22 && !piece) {
                      const angle = (Math.atan2(fy, fx) * 180) / Math.PI;
                      const op = Math.min(mag / 130, 0.9);
                      return (
                        <svg
                          viewBox="0 0 24 24"
                          className="flow-arrow"
                          style={{ opacity: op, transform: `rotate(${angle.toFixed(0)}deg)` }}
                        >
                          <path
                            d="M3 12h15m0 0l-5-5m5 5l-5 5"
                            stroke="#1e293b"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            fill="none"
                          />
                        </svg>
                      );
                    }
                    return null;
                  })()}

                {f === files[0] && (
                  <span className="coord-rank" style={{ color: coordColor }}>
                    {r + 1}
                  </span>
                )}
                {r === ranks[7] && (
                  <span className="coord-file" style={{ color: coordColor }}>
                    {String.fromCharCode(97 + f)}
                  </span>
                )}

                {piece && !isDraggingSource && <PieceSvg piece={piece} />}

                {target && (piece ? <div className="legal-ring" /> : <div className="legal-dot" />)}
              </div>
            );
          }),
        )}

        {renderArrowList.length > 0 && (
          <svg viewBox="0 0 100 100" className="board-arrows-svg">
            {renderArrowList.map((ar, idx) => {
              const p1 = squareToPercent(ar.from, flipped);
              const p2 = squareToPercent(ar.to, flipped);
              const dx = p2.cx - p1.cx;
              const dy = p2.cy - p1.cy;
              const len = Math.hypot(dx, dy) || 1;
              const ux = dx / len;
              const uy = dy / len;
              const px = -uy;
              const py = ux;
              const startX = p1.cx + ux * 2.2;
              const startY = p1.cy + uy * 2.2;
              const headBaseX = p2.cx - ux * 3.8;
              const headBaseY = p2.cy - uy * 3.8;
              const w = 1.15;
              const hw = 2.7;
              const pts = [
                `${startX + px * w},${startY + py * w}`,
                `${headBaseX + px * w},${headBaseY + py * w}`,
                `${headBaseX + px * hw},${headBaseY + py * hw}`,
                `${p2.cx},${p2.cy}`,
                `${headBaseX - px * hw},${headBaseY - py * hw}`,
                `${headBaseX - px * w},${headBaseY - py * w}`,
                `${startX - px * w},${startY - py * w}`,
              ].join(' ');
              return <polygon key={`${ar.from}-${ar.to}-${idx}`} points={pts} fill={ar.color} />;
            })}
          </svg>
        )}

        {pendingPromo && (
          <div
            className="promo-backdrop"
            onPointerDown={(e) => {
              e.stopPropagation();
              setPendingPromo(null);
            }}
          >
            <div
              className="promo-picker"
              style={{
                left: `${(flipped ? 7 - (pendingPromo.to & 7) : pendingPromo.to & 7) * 12.5}%`,
                top: (flipped ? (pendingPromo.to >> 3) === 0 : (pendingPromo.to >> 3) === 7)
                  ? '0%'
                  : '50%',
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {(['q', 'r', 'b', 'n'] as const).map((promo) => {
                const ch = (
                  pendingPromo.color === 'w' ? promo.toUpperCase() : promo
                ) as PieceChar;
                return (
                  <button
                    key={promo}
                    type="button"
                    className="promo-btn"
                    onClick={() => {
                      if (pendingPromo.isPremove) {
                        onSetPremove({ from: pendingPromo.from, to: pendingPromo.to, promo });
                      } else {
                        const match = legalMoves.find(
                          (m) =>
                            m.from === pendingPromo.from &&
                            m.to === pendingPromo.to &&
                            m.promo === promo,
                        );
                        if (match) onMakeMove(match.uci);
                      }
                      setPendingPromo(null);
                    }}
                  >
                    <PieceSvg piece={ch} className="promo-piece-svg" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {dragVisual && (
          <div ref={ghostRef} className="drag-ghost">
            <PieceSvg piece={dragVisual.piece} className="drag-ghost-svg" />
          </div>
        )}
      </div>
    );
  },
);
