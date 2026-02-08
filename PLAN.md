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
│  │  Engine   │──▶│  Pipeline    │──▶│  (WebGL2)    │ │
│  │          │   │              │   │              │ │
│  │ Web Audio │   │ AnalyserNode │   │ User shader  │ │
│  │ API       │   │ + TypeScript │   │ programs     │ │
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

#### 2. Analysis Pipeline (Web Audio AnalyserNode + TypeScript)
- `AnalyserNode` provides FFT and time-domain data (browser-native, Blackman-windowed)
- TypeScript `Analyzer` class computes derived features per frame:
  - Band energy (bass / mid / treble)
  - Beat detection (energy-based onset with rolling average + debounce)
  - BPM estimation from beat intervals
  - Spectral centroid (sound brightness)
- Output: audio texture (512×2) + uniform values (bass, mid, treble, beat, BPM, spectral centroid)

#### 3. Renderer (WebGL2)
- Each frame:
  1. Upload audio texture + uniforms to GPU
  2. Execute user's visualization shader
  3. Support feedback buffers (previous frame as input → motion/blur effects)
  4. Multi-pass rendering (warp pass, composite pass)
- Preset system:
  - Each preset = a GLSL fragment shader + metadata (name, author, tags)
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
| Language | TypeScript | Type safety, broad ecosystem |
| GPU API | WebGL2 | Broad browser support, GLSL shaders |
| Shader language | GLSL ES 3.0 | Shadertoy-compatible, well-known |
| Build system | Vite | Fast HMR, zero config |
| Audio analysis | Web Audio AnalyserNode | Browser-native FFT, no build dependencies |
| Editor | Monaco | VS Code quality, GLSL syntax support |
| Framework | None (vanilla) | Minimal overhead; visualization is the app |

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

### Phase 3: Audio Feature Extraction ✅
**Goal:** Add beat detection, BPM, and spectral analysis.

- [x] Beat detection (energy-based onset with rolling average + debounce)
- [x] BPM estimation from beat intervals
- [x] Spectral centroid (sound brightness)
- [x] New uniforms: `iSpectralCentroid`, `iBPM`

### Phase 4: Advanced Rendering + Editor ✅
**Goal:** Unlock advanced visual effects and a polished editor experience.

- [x] Feedback buffers (iBackbuffer via FBO ping-pong)
- [x] Resolution scaling for performance (25%–100%)
- [x] 3 new feedback presets (Feedback Trails, Warp Feedback, Kaleidoscope)
- [x] Shader error parsing with line mapping (Chrome + Firefox formats)
- [x] Clickable error panel navigates to error line in editor
- [x] Monaco hover provider showing type, description, live value for uniforms
- [x] Full uniform inspector with type badges, live values, visual bars
- [x] Code cleanup: vertex shader caching, first-frame fix, dead code removal

### Phase 4b: Beat Detection & Audio Analysis Improvements
**Goal:** Make beat detection more reliable and audio data more useful.

The current beat detector uses a simple energy threshold with rolling average.
It works for four-on-the-floor dance music but struggles with:
- Tracks with gradual energy changes (false positives)
- Complex rhythms where kicks overlap with other instruments
- Quiet sections followed by sudden hits (threshold too low after silence)
- BPM estimation drifting on syncopated rhythms

**Potential improvements:**

- [ ] Spectral flux onset detection (compare FFT frame-to-frame, not just energy)
- [ ] Multi-band beat detection (separate onset detectors for bass/mid/treble)
- [ ] Adaptive threshold with separate attack/release rates
- [ ] Auto-correlation BPM (more robust than interval averaging)
- [ ] Onset strength envelope with configurable sensitivity
- [ ] Median-filtered BPM to reject outlier intervals
- [ ] Separate `iBeatBass` / `iBeatSnare` / `iBeatHihat` uniforms for per-band onsets

**FFT display quality:**

The AnalyserNode provides 512 linearly-spaced bins (~43 Hz each at 44.1 kHz).
This is a fundamental property of the DFT — not a bug — but it means:
- Most musical content (20–4000 Hz) lives in the first ~93 bins (18% of texture)
- High frequencies (4–22 kHz) get 82% of bins but carry little energy
- MP3 encoding adds quantization noise in upper bins and cuts off at 16–18 kHz

Presets now use `pow(x, 3.0)` log-frequency mapping to spread bass/mid across
the full screen width. Future options:
- [ ] Pre-compute log-frequency texture in the Analyzer (so all shaders benefit)
- [ ] Mel-scale or Bark-scale binning for perceptually uniform frequency display
- [ ] Smoothing/interpolation between frames to reduce FFT flicker

### Phase 5: Preset Compatibility
**Goal:** Import shaders and presets from existing ecosystems.

#### 5a. Shadertoy Import (easy — high value)
Shadertoy shaders use the same GLSL but with a different entry point and
slightly different uniforms. A thin adapter layer can make most Shadertoy
audio-reactive shaders work in NewAmp.

- [ ] Shadertoy adapter: wrap `mainImage(out vec4, in vec2)` → our `main()`
- [ ] Compatibility defines: `vec3 iResolution` → our `vec2`, add `iMouse` stub
- [ ] Import UI: paste Shadertoy shader code, auto-detect and wrap
- [ ] Audio texture mapping note (Shadertoy uses `iChannel0` the same way)
- [ ] Bundle 5–10 popular Shadertoy audio shaders as built-in presets

Key differences to bridge:
```
Shadertoy                          NewAmp
─────────────────────────────────  ──────────────────────────
void mainImage(out vec4, in vec2)  void main()
fragCoord (pixel coords)           vUv (0–1 normalized)
iResolution (vec3)                 iResolution (vec2)
iFrame (int)                       iFrame (float)
iMouse (vec4)                      (not available)
gl_FragCoord                       (available via vUv * iResolution)
```

#### 5b. MilkDrop Compatibility (medium-hard — massive preset library)

MilkDrop .milk presets use a fundamentally different paradigm:
- INI-like text format with key=value pairs
- EEL2 expression language (not GLSL) for per-frame/per-pixel equations
- Built-in motion pipeline: zoom, rot, warp, decay, per-vertex mesh grid
- MilkDrop 2 added HLSL pixel shaders (warp shader + composite shader)
- Q variables (q1–q32) bridge equation pools to shaders
- Custom shapes and waves with their own equation code

**Two tiers of support:**

**Tier 1: MilkDrop 2 pixel shaders (HLSL→GLSL)**
- [ ] Use butterchurn's HLSL→GLSL transpiler (MIT licensed, npm: `milkdrop-shader-converter`)
- [ ] Map MilkDrop uniforms (q1–q32, _qa–_qh, time, bass/mid/treb) to NewAmp equivalents
- [ ] Import UI for .milk files: extract warp/composite shaders, convert, load

**Tier 2: Full .milk preset playback (via Butterchurn)**
- [ ] Integrate [butterchurn](https://github.com/jberg/butterchurn) as an optional renderer
- [ ] Use [milkdrop-preset-converter](https://github.com/jberg/milkdrop-preset-converter) to parse .milk → JSON
- [ ] [milkdrop-eel-parser](https://github.com/jberg/milkdrop-eel-parser) handles EEL2→JS for equations
- [ ] Render MilkDrop presets alongside native NewAmp shaders
- [ ] Bundle curated set of classic .milk presets (cream of the crop from 10,000+)

#### 5c. AVS (deprioritized)

AVS uses a binary file format and a completely different rendering model
(stacked effect tree, not shaders). An [AVS-File-Decoder](https://github.com/grandchild/AVS-File-Decoder)
exists to parse .avs → JSON, but rendering them requires reimplementing
the full AVS engine. Not worth building from scratch — link to existing
tools instead.

### Phase 6: Community + Polish
**Goal:** Sharing, discovery, and a polished experience.

- [ ] Preset gallery with thumbnails (generated via offscreen render)
- [ ] Share presets via URL (shader code in URL hash or short links)
- [ ] Playlist management (queue, shuffle, repeat)
- [ ] Fullscreen mode with auto-hiding UI
- [x] Keyboard shortcuts (space=pause, arrows=seek, F=fullscreen, E=editor)
- [ ] Mobile-responsive layout
- [ ] Optional: backend for preset sharing/voting

### Phase 7: WebGPU + Advanced Pipeline (future)
**Goal:** Next-gen rendering for browsers that support WebGPU.

- [ ] WebGPU renderer (with WebGL2 fallback path retained)
- [ ] Multi-pass rendering pipeline (warp pass + composite pass)
- [ ] GPU compute shader for FFT (eliminate CPU→GPU audio texture transfer)
- [ ] WGSL shader support in editor (dual GLSL/WGSL)

## Key Design Decisions

### Why browser-first, not native?
- Zero install — users open a URL and start visualizing
- Butterchurn proves MilkDrop-quality is achievable in the browser
- WebGL2 supported in all modern browsers
- Web Audio API AnalyserNode provides high-quality FFT with no dependencies

### Why not just fork Butterchurn?
- Butterchurn is MilkDrop-specific — it replays presets in a legacy format
- We want a general shader programming environment, not a preset replay engine
- Modern GLSL authoring instead of MilkDrop's custom expression language
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
