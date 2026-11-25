import React, { useEffect, useRef, useState } from 'react';
import { Bot, User } from 'lucide-react';
import { PieceChar } from '../types/chess';
import { formatClock } from '../utils/chessHelpers';
import { PieceSvg } from './Pieces';

interface ChessClockProps {
  baseMs: number;
  running: boolean;
  syncEpoch: number;
  onTimeout: () => void;
  clockRef: React.MutableRefObject<number>;
}

const ChessClock: React.FC<ChessClockProps> = React.memo(
  ({ baseMs, running, syncEpoch, onTimeout, clockRef }) => {
    const [displayMs, setDisplayMs] = useState(clockRef.current);
    const timeoutFiredRef = useRef(false);

    useEffect(() => {
      setDisplayMs(clockRef.current);
      if (clockRef.current > 0) timeoutFiredRef.current = false;
    }, [syncEpoch, baseMs, clockRef]);

    useEffect(() => {
      if (!running) {
        setDisplayMs(clockRef.current);
        return;
      }
      let last = performance.now();
      const id = window.setInterval(() => {
        const now = performance.now();
        const dt = now - last;
        last = now;
        const next = Math.max(0, clockRef.current - dt);
        clockRef.current = next;
        setDisplayMs(next);
        if (next === 0 && !timeoutFiredRef.current) {
          timeoutFiredRef.current = true;
          onTimeout();
        }
      }, 100);
      return () => window.clearInterval(id);
    }, [running, clockRef, onTimeout]);

    const isLow = displayMs <= 10_000;
    return (
      <div className={`clock-box ${running ? 'active' : 'idle'} ${isLow ? 'low' : ''}`}>
        {formatClock(displayMs)}
      </div>
    );
  },
);

interface PlayerBarProps {
  name: string;
  rating?: string;
  isBot?: boolean;
  isActiveTurn: boolean;
  clockRunning: boolean;
  isThinking?: boolean;
  capturedPieces: PieceChar[];
  materialAdv: number;
  baseMs: number;
  syncEpoch: number;
  clockRef: React.MutableRefObject<number>;
  onTimeout: () => void;
  unlimitedTime: boolean;
}

export const PlayerBar: React.FC<PlayerBarProps> = React.memo(
  ({
    name,
    rating,
    isBot = false,
    clockRunning,
    isThinking = false,
    capturedPieces,
    materialAdv,
    baseMs,
    syncEpoch,
    clockRef,
    onTimeout,
    unlimitedTime,
  }) => {
    return (
      <div className="player-bar">
        <div className="player-left">
          <div className={`player-avatar ${isBot ? 'bot' : 'human'}`}>
            {isBot ? <Bot size={18} /> : <User size={18} />}
          </div>
          <div className="player-meta">
            <div className="player-title-row">
              <span className="player-name">{name}</span>
              {rating && <span className="player-rating">({rating})</span>}
              {isThinking && (
                <span className="thinking-pill">
                  <span className="thinking-dot" />
                  Thinking
                </span>
              )}
            </div>
            <div className="captured-strip">
              {capturedPieces.map((p, i) => (
                <span key={`${p}-${i}`} className="captured-icon">
                  <PieceSvg piece={p} className="captured-svg" />
                </span>
              ))}
              {materialAdv > 0 && <span className="material-adv">+{materialAdv}</span>}
            </div>
          </div>
        </div>

        {!unlimitedTime && (
          <ChessClock
            baseMs={baseMs}
            running={clockRunning}
            syncEpoch={syncEpoch}
            clockRef={clockRef}
            onTimeout={onTimeout}
          />
        )}
      </div>
    );
  },
);
