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

### Phase 1: Core Audio + Basic Rendering (MVP)
**Goal:** Play a local audio file and render a shader that reacts to it.

- [ ] Project scaffolding (Vite + TypeScript)
- [ ] Audio engine: load local files, decode, play with transport controls
- [ ] AnalyserNode-based FFT (good enough for MVP, no WASM yet)
- [ ] WebGL2 renderer: fullscreen quad + fragment shader
- [ ] Audio data → texture upload each frame
- [ ] 3-5 built-in preset shaders (classic bars, waveform, radial, etc.)
- [ ] Basic UI: file picker, play/pause, preset selector

### Phase 2: Shader Editor + Preset System
**Goal:** Users can write and save their own visualization shaders.

- [ ] Embed Monaco editor with GLSL/WGSL syntax highlighting
- [ ] Live shader compilation + hot-swap
- [ ] Error reporting from shader compiler
- [ ] Preset save/load (localStorage)
- [ ] Preset export/import as JSON files
- [ ] Uniform inspector panel

### Phase 3: WASM Audio Pipeline
**Goal:** Replace AnalyserNode with high-quality Rust WASM FFT.

- [ ] Rust crate for FFT analysis (`rustfft`, windowing, multi-resolution)
- [ ] Compile to WASM, load in AudioWorklet
- [ ] SharedArrayBuffer ring buffer for zero-copy data transfer
- [ ] Beat detection algorithm
- [ ] Enhanced audio uniforms (BPM, beat phase, spectral centroid, etc.)

### Phase 4: WebGPU + Advanced Rendering
**Goal:** Unlock compute shaders and advanced visual effects.

- [ ] WebGPU renderer (with WebGL2 fallback path)
- [ ] Feedback buffers (previous frame as texture input)
- [ ] Multi-pass rendering pipeline
- [ ] GPU compute shader for FFT (eliminate CPU→GPU transfer)
- [ ] WGSL shader support in editor
- [ ] Resolution scaling for performance

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
