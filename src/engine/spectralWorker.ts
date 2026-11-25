import { EngineState } from '../types/chess';

type ReqPayload =
  | { id: number; type: 'init'; wasmUrl: string }
  | { id: number; type: 'cmd'; op: number; input: string; arg1: number; arg2: number };

let wasmInst: WebAssembly.Instance | null = null;
const enc = new TextEncoder();
const dec = new TextDecoder();

async function ensureWasm(wasmUrl: string) {
  if (wasmInst) return wasmInst;
  const resp = await fetch(wasmUrl);
  if (!resp.ok) {
    throw new Error(`Failed to fetch Spectral WASM (${resp.status}) from ${wasmUrl}`);
  }
  const bytes = await resp.arrayBuffer();
  const imports = {
    env: {
      js_now_ms: () => performance.now(),
    },
  };
  const { instance } = await WebAssembly.instantiate(bytes, imports);
  wasmInst = instance;
  return instance;
}

function runCmd(op: number, input: string, arg1: number, arg2: number): EngineState {
  if (!wasmInst) throw new Error('Spectral WASM not initialized');
  const exports = wasmInst.exports as {
    memory: WebAssembly.Memory;
    spectral_in_ptr: () => number;
    spectral_out_ptr: () => number;
    spectral_cmd: (op: number, len: number, a1: number, a2: number) => number;
  };
  const bufBytes = enc.encode(input);
  if (bufBytes.length > 0) {
    new Uint8Array(exports.memory.buffer, exports.spectral_in_ptr(), bufBytes.length).set(bufBytes);
  }
  const outLen = exports.spectral_cmd(op, bufBytes.length, arg1, arg2);
  const jsonBytes = new Uint8Array(exports.memory.buffer, exports.spectral_out_ptr(), outLen);
  return JSON.parse(dec.decode(jsonBytes)) as EngineState;
}

self.onmessage = async (ev: MessageEvent<ReqPayload>) => {
  const msg = ev.data;
  try {
    if (msg.type === 'init') {
      await ensureWasm(msg.wasmUrl);
      const state = runCmd(0, '', 0, 0);
      self.postMessage({ id: msg.id, ok: true, state });
    } else if (msg.type === 'cmd') {
      if (!wasmInst) throw new Error('WASM engine not ready');
      const state = runCmd(msg.op, msg.input, msg.arg1, msg.arg2);
      self.postMessage({ id: msg.id, ok: true, state });
    }
  } catch (err) {
    self.postMessage({
      id: msg.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
