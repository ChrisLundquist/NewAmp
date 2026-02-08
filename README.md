# NewAmp

A browser-based music visualization player with a live GLSL shader editor.
Load any audio file, pick a preset or write your own shader, and watch your
music come to life in real-time.

**Features**

- Drag-and-drop audio playback with full transport controls
- Real-time WebGL2 visualizations driven by FFT, beat detection, and spectral analysis
- Built-in Monaco (VS Code) shader editor with GLSL autocomplete and live error feedback
- Rust/WASM DSP pipeline for high-quality audio analysis
- Preset system with save, load, import/export
- Shadertoy-compatible uniform naming (`iTime`, `iResolution`, `iChannel0`, ...)
- Feedback buffer support for trails and motion-blur effects

**Live Demo**

<https://chrislundquist.github.io/NewAmp/>
