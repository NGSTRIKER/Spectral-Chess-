import { EngineState } from '../types/chess';

class SpectralEngineClient {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, { resolve: (s: EngineState) => void; reject: (e: Error) => void }>();

  constructor() {
    this.worker = new Worker(new URL('./spectralWorker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev: MessageEvent<{ id: number; ok: boolean; state?: EngineState; error?: string }>) => {
      const { id, ok, state, error } = ev.data;
      const p = this.pending.get(id);
      if (!p) return;
      this.pending.delete(id);
      if (ok && state) {
        p.resolve(state);
      } else {
        p.reject(new Error(error || 'Engine error'));
      }
    };
  }

  init(): Promise<EngineState> {
    const id = this.nextId++;
    const base = import.meta.env.BASE_URL || './';
    const wasmUrl = new URL(`${base.replace(/\/?$/, '/')}engine/spectral.wasm`, window.location.href).href;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, type: 'init', wasmUrl });
    });
  }

  private cmd(op: number, input = '', arg1 = 0, arg2 = 0): Promise<EngineState> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, type: 'cmd', op, input, arg1, arg2 });
    });
  }

  newGame(fen = ''): Promise<EngineState> {
    return this.cmd(0, fen, 0, 0);
  }

  makeMove(uci: string): Promise<EngineState> {
    return this.cmd(1, uci, 0, 0);
  }

  undo(plies = 1): Promise<EngineState> {
    return this.cmd(2, '', plies, 0);
  }

  engineMove(maxDepth: number, movetimeMs: number): Promise<EngineState> {
    return this.cmd(3, '', maxDepth, movetimeMs);
  }

  analyze(maxDepth: number, movetimeMs: number): Promise<EngineState> {
    return this.cmd(4, '', maxDepth, movetimeMs);
  }
}

export const spectralEngine = new SpectralEngineClient();
