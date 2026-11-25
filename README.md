# Spectral Chess (Web Arena)

Public browser UI for **Spectral `v0.7.0`** (`SFLUID05` D2Q17 Fluid-Wave Chess Engine), running completely client-side via WebAssembly (`public/engine/spectral.wasm`) inside a Web Worker.

## Features
- Chess.com-inspired dark green UI (`#302e2b` / `#262421` / `#eeeed2` & `#769656` Classic Green + 4 board themes)
- Pointer drag-and-drop, click-to-move, premoves, right-click square highlights & SVG arrows, promotion picker, and synthesized Web Audio sound effects
- Live tabular clocks (`1+0`, `3|2`, `5+0`, `10+0`, `Unlimited`), captured material strip (`+N`), clickable SAN move history with `|< < > >|` keyboard replay, and vertical evaluation bar
- **D2Q17 Fluid Lab:** toggleable Pressure, Flow Vectors `(Jx, Jy)`, Shock/Turbulence, and Dam Gradient overlays plus Reynolds Number (`Re`), King Shock, PV, depth, and WASM NPS telemetry
- Zero server required — works out of the box on GitHub Pages, Vercel, Cloudflare Pages, or Netlify

## Local Development

```bash
npm install
npm run dev
```

## Production Build

```bash
npm run build
```
