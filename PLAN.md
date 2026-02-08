# NewAmp — Music Visualization Player

## Vision

A browser-based music player and visualization platform where users write shader
programs (GLSL/WGSL) that react to music in real-time — a modern, open successor
to Winamp's MilkDrop/Geiss plugin ecosystem.

## Prior Art

| Project | What it does | Gap |
|---|---|---|
| Butterchurn | WebGL port of MilkDrop, plays original presets | Replay-only, no modern authoring |
| Milkshake | Another WebGL MilkDrop renderer | Same — no authoring UX |
| Shadertoy | Audio-reactive shader playground | Not a music player; no playlist/library |
| Winamp (original) | Desktop player + MilkDrop/Geiss plugins | Native-only, aging codebase |

**Our differentiator:** A *player* with a *programmable visualization layer* and a
modern authoring experience — think "Shadertoy meets Spotify" with community-shared
presets.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Browser Tab                       │
│                                                      │
│  ┌──────────┐   ┌──────────────┐   ┌──────────────┐ │
│  │  Audio    │   │  Analysis    │   │  Renderer    │ │
│  │  Engine   │──▶│  Pipeline    │──▶│  (WebGPU)    │ │
│  │          │   │              │   │              │ │
│  │ Web Audio │   │ AudioWorklet │   │ User shader  │ │
│  │ API       │   │ + WASM FFT   │   │ programs     │ │
│  └──────────┘   └──────────────┘   └──────────────┘ │
│        │                                     │       │
│        ▼                                     ▼       │
│  ┌──────────┐                        ┌────────────┐  │
│  │ Player   │                        │ Shader     │  │
│  │ UI       │                        │ Editor     │  │
│  │ controls │                        │ (Monaco)   │  │
│  └──────────┘                        └────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Component Breakdown

#### 1. Audio Engine (Web Audio API)
- Decode MP3/OGG/FLAC/WAV via `AudioContext.decodeAudioData()`
- Playback via `AudioBufferSourceNode`
- File input: local files via `<input type="file">`, drag-and-drop
- Future: streaming URLs (requires CORS-friendly sources)

#### 2. Analysis Pipeline (AudioWorklet + WASM)
- `AudioWorklet` captures every sample (128-sample blocks, dedicated thread)
- Rust compiled to WASM performs FFT inside the worklet:
  - Full complex FFT (magnitude + phase)
  - Configurable window functions (Hanning, Blackman-Harris, Kaiser)
  - Multi-resolution: large FFT for bass, small FFT for treble
  - Beat detection (energy-based onset detection)
- Data passed to main thread via `SharedArrayBuffer` (zero-copy)
- Output: audio texture (512×2 or configurable) + uniform values (bass, mid, treble energy, beat flag, BPM estimate)

#### 3. Renderer (WebGPU, WebGL2 fallback)
- Each frame:
  1. Upload audio texture + uniforms to GPU
  2. Execute user's visualization shader
  3. Support feedback buffers (previous frame as input → motion/blur effects)
  4. Multi-pass rendering (warp pass, composite pass)
- Preset system:
  - Each preset = a WGSL fragment shader + metadata (name, author, tags)
  - Shadertoy-compatible uniform convention (`iTime`, `iResolution`, `iChannel0` for audio)
  - Built-in library of starter presets

#### 4. Shader Editor
- Monaco editor embedded in a collapsible panel
- Live reload on edit (hot-swap shader without restarting audio)
- Error display with line numbers from shader compilation
- Uniform inspector (see current audio values in real-time)
- Save/load presets to localStorage or export as JSON

#### 5. Player UI
- Minimal, stays out of the way during visualization
- Transport controls: play, pause, seek, volume
- Playlist / file queue
- Preset selector (dropdown or gallery with thumbnails)
- Fullscreen mode (hides UI, shows only visualization)

## Technology Choices

| Layer | Choice | Rationale |
|---|---|---|
| Language (UI) | TypeScript | Type safety, broad ecosystem |
| Language (DSP) | Rust → WASM | Zero-cost FFT, no GC in audio thread |
| GPU API | WebGPU (primary), WebGL2 (fallback) | WebGPU for compute shaders + modern API; WebGL2 for older browsers |
| Shader language | WGSL (WebGPU) / GLSL (WebGL2) | Native to each API |
| Build system | Vite | Fast HMR, WASM plugin support |
| Audio analysis | `rustfft` crate → WASM | Full complex FFT, proven performance |
| Editor | Monaco | VS Code quality, GLSL/WGSL syntax support |
| Framework | None (vanilla) or Lit | Minimal overhead; visualization is the app |

## Implementation Phases

### Phase 1: Core Audio + Basic Rendering (MVP) ✅
**Goal:** Play a local audio file and render a shader that reacts to it.

- [x] Project scaffolding (Vite + TypeScript)
- [x] Audio engine: load local files, decode, play with transport controls
- [x] AnalyserNode-based FFT (good enough for MVP, no WASM yet)
- [x] WebGL2 renderer: fullscreen quad + fragment shader
- [x] Audio data → texture upload each frame
- [x] 5 built-in preset shaders (Spectrum Bars, Neon Waveform, Radial Spectrum, Audio Plasma, Tunnel Vortex)
- [x] Basic UI: file picker, play/pause, seek, volume, preset selector, drag-and-drop

### Phase 2: Shader Editor + Preset System ✅
**Goal:** Users can write and save their own visualization shaders.

- [x] Embed Monaco editor with GLSL syntax highlighting + uniform autocomplete
- [x] Live shader compilation + hot-swap (300ms debounce)
- [x] Error reporting from shader compiler (Monaco markers + error panel)
- [x] Preset save/load (localStorage)
- [x] Preset export/import as JSON files
- [x] Uniform inspector panel (real-time iBass/iMid/iTreble/iBeat bars)

### Phase 3: WASM Audio Pipeline ✅
**Goal:** Replace AnalyserNode with high-quality Rust WASM FFT.

- [x] Rust crate (`newamp-dsp`) with `rustfft` for 1024-point Hanning-windowed FFT
- [x] Compile to WASM via wasm-pack, load on main thread via `?url` import
- [x] WasmAnalyzer reads float32 time-domain from AnalyserNode → WASM FFT
- [x] Beat detection (energy-based onset with rolling average + debounce)
- [x] BPM estimation from beat intervals
- [x] Spectral centroid (sound brightness)
- [x] New uniforms: `iSpectralCentroid`, `iBPM`
- [x] Graceful fallback to AnalyserNode if WASM fails to load

### Phase 4: Advanced Rendering + Editor (partial)
**Goal:** Unlock advanced visual effects and a polished editor experience.

- [x] Feedback buffers (iBackbuffer via FBO ping-pong)
- [x] Resolution scaling for performance (25%–100%)
- [x] 3 new feedback presets (Feedback Trails, Warp Feedback, Kaleidoscope)
- [x] Shader error parsing with line mapping (Chrome + Firefox formats)
- [x] Clickable error panel navigates to error line in editor
- [x] Monaco hover provider showing type, description, live value for uniforms
- [x] Full uniform inspector with type badges, live values, visual bars
- [ ] WebGPU renderer (with WebGL2 fallback path)
- [ ] Multi-pass rendering pipeline
- [ ] GPU compute shader for FFT (eliminate CPU→GPU transfer)
- [ ] WGSL shader support in editor

### Phase 5: Community + Polish
**Goal:** Sharing, discovery, and a polished experience.

- [ ] Preset gallery with thumbnails (generated via offscreen render)
- [ ] Share presets via URL (shader code in URL hash or short links)
- [ ] Playlist management (queue, shuffle, repeat)
- [ ] Fullscreen mode with hidden UI
- [ ] Keyboard shortcuts (space=pause, arrows=seek, F=fullscreen)
- [ ] Mobile-responsive layout
- [ ] Optional: backend for preset sharing/voting

## Key Design Decisions

### Why browser-first, not native?
- Zero install — users open a URL and start visualizing
- Butterchurn proves MilkDrop-quality is achievable in the browser
- WebGPU now supported in all major browsers (Chrome, Firefox, Safari, Edge)
- Rust/WASM gives us native DSP performance where it matters
- wgpu (used in the WASM pipeline) can target native backends too — if we
  ever want a native app, the GPU code is portable

### Why not just fork Butterchurn?
- Butterchurn is MilkDrop-specific — it replays presets in a legacy format
- We want a general shader programming environment, not a preset replay engine
- Modern WGSL/WebGPU instead of MilkDrop's custom expression language
- Clean architecture designed for extensibility

### Shader API Convention (Shadertoy-compatible)
User shaders receive these inputs:
```glsl
uniform float     iTime;          // playback time in seconds
uniform float     iTimeDelta;     // time since last frame
uniform vec2      iResolution;    // viewport resolution in pixels
uniform sampler2D iChannel0;      // audio data texture
                                  //   row 0 (y≈0.25): FFT spectrum
                                  //   row 1 (y≈0.75): waveform
uniform float     iBass;          // bass energy (20-250 Hz)
uniform float     iMid;           // mid energy (250-4000 Hz)
uniform float     iTreble;        // treble energy (4000-20000 Hz)
uniform float     iBeat;          // beat intensity (0.0 - 1.0)
uniform float     iBPM;           // estimated BPM
uniform sampler2D iBackbuffer;    // previous frame (for feedback effects)
```
