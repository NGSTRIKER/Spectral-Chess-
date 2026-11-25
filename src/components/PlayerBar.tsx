import React from 'react';
import { Bot, User } from 'lucide-react';
import { PieceChar } from '../types/chess';
import { formatClock } from '../utils/chessHelpers';
import { PieceSvg } from './Pieces';

interface PlayerBarProps {
  name: string;
  rating?: string;
  isBot?: boolean;
  isActiveTurn: boolean;
  isThinking?: boolean;
  capturedPieces: PieceChar[];
  materialAdv: number;
  clockMs: number | null;
  unlimitedTime: boolean;
}

export const PlayerBar: React.FC<PlayerBarProps> = ({
  name,
  rating,
  isBot = false,
  isActiveTurn,
  isThinking = false,
  capturedPieces,
  materialAdv,
  clockMs,
  unlimitedTime,
}) => {
  const isLow = clockMs !== null && !unlimitedTime && clockMs <= 10_000;

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

      {!unlimitedTime && clockMs !== null && (
        <div className={`clock-box ${isActiveTurn ? 'active' : 'idle'} ${isLow ? 'low' : ''}`}>
          {formatClock(clockMs)}
        </div>
      )}
    </div>
  );
};
