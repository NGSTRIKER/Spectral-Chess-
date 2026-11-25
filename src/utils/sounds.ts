class ChessAudio {
  private ctx: AudioContext | null = null;
  public muted = false;

  private ensureCtx(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private tone(freq: number, dur: number, type: OscillatorType, gainVal: number, freqEnd?: number) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, now + dur);
    g.gain.setValueAtTime(gainVal, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur);
  }

  playMove() {
    this.tone(240, 0.06, 'triangle', 0.14, 120);
  }

  playCapture() {
    this.tone(360, 0.075, 'sawtooth', 0.11, 140);
    this.tone(180, 0.08, 'triangle', 0.14, 90);
  }

  playCheck() {
    this.tone(540, 0.09, 'sine', 0.13, 420);
    setTimeout(() => this.tone(680, 0.1, 'triangle', 0.11, 520), 40);
  }

  playCastle() {
    this.tone(240, 0.055, 'triangle', 0.12, 130);
    setTimeout(() => this.tone(280, 0.06, 'triangle', 0.12, 150), 65);
  }

  playGameEnd() {
    this.tone(440, 0.14, 'triangle', 0.12);
    setTimeout(() => this.tone(554, 0.18, 'triangle', 0.12), 90);
    setTimeout(() => this.tone(659, 0.24, 'triangle', 0.12), 180);
  }
}

export const chessAudio = new ChessAudio();
