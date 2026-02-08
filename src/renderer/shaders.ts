export interface Preset {
  name: string;
  fragmentShader: string;
}

/** Shared vertex shader — draws a fullscreen quad via triangle strip. */
export const VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec2 aPosition;
out vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

/** Prepended to every user / preset fragment shader. */
export const FRAGMENT_HEADER = `#version 300 es
precision highp float;

uniform float     iTime;
uniform float     iTimeDelta;
uniform vec2      iResolution;
uniform sampler2D iChannel0;      // 512×2 audio texture (R8, LINEAR filtered)
                                  //   texture(iChannel0, vec2(x, 0.25)).r → FFT magnitude
                                  //     x: 0.0=0Hz … 0.5≈11kHz … 1.0≈22kHz  (512 linear bins, ~43Hz each)
                                  //     TIP: use pow(x, 3.0) for log-frequency — most music is below 4kHz
                                  //   texture(iChannel0, vec2(x, 0.75)).r → PCM waveform
                                  //     x: 0.0=first sample … 1.0=last  (~11.6ms window at 44.1kHz)
                                  //     value 0.5=silence, >0.5=positive, <0.5=negative
uniform sampler2D iBackbuffer;    // previous frame output (for feedback effects)
uniform float     iBass;
uniform float     iMid;
uniform float     iTreble;
uniform float     iBeat;
uniform float     iSpectralCentroid;
uniform float     iBPM;
uniform float     iFrame;

in  vec2 vUv;
out vec4 fragColor;
`;

/** Number of lines in FRAGMENT_HEADER (for error line offset mapping). */
export const FRAGMENT_HEADER_LINES = FRAGMENT_HEADER.split('\n').length - 1;

export const presets: Preset[] = [
  // ── 1. Spectrum Bars ──────────────────────────────────────────
  {
    name: 'Spectrum Bars',
    fragmentShader: `
void main() {
  vec2 uv = vUv;

  // Log-frequency mapping: spread bass/mid across more of the screen.
  // Linear uv.x maps 0-22kHz evenly, but music lives below ~4kHz.
  // pow(x, 3) gives ~75% of screen width to the first ~10% of bins.
  float freqX = pow(uv.x, 3.0);
  float freq = texture(iChannel0, vec2(freqX, 0.25)).r;

  // Soft bar
  float bar = smoothstep(uv.y + 0.01, uv.y - 0.01, freq);

  // Gradient blue → pink
  vec3 col = mix(vec3(0.1, 0.4, 1.0), vec3(1.0, 0.2, 0.6), uv.y);

  // Glow at the bar edge
  float glow = exp(-4.0 * abs(uv.y - freq)) * freq;
  col = col * bar + vec3(0.4, 0.15, 0.6) * glow;

  fragColor = vec4(col, 1.0);
}
`,
  },

  // ── 2. Neon Waveform ──────────────────────────────────────────
  {
    name: 'Neon Waveform',
    fragmentShader: `
void main() {
  vec2 uv = vUv;
  float wave = texture(iChannel0, vec2(uv.x, 0.75)).r;

  float y = (wave - 0.5) * 1.6;          // center and scale
  float d = abs(uv.y - 0.5 - y);         // distance from wave line

  float line      = 0.003 / (d + 0.003);
  float outerGlow = 0.015 / (d + 0.015);

  vec3 col = vec3(0.2, 1.0, 0.4) * line
           + vec3(0.05, 0.35, 0.15) * outerGlow;

  fragColor = vec4(col, 1.0);
}
`,
  },

  // ── 3. Radial Spectrum ────────────────────────────────────────
  {
    name: 'Radial Spectrum',
    fragmentShader: `
void main() {
  vec2 uv = vUv * 2.0 - 1.0;
  uv.x *= iResolution.x / iResolution.y;

  float angle  = atan(uv.y, uv.x);
  float radius = length(uv);

  // Map angle to 0-1, then apply log-frequency curve
  float a = (angle + 3.14159) / (2.0 * 3.14159);
  float freqX = pow(a, 3.0);
  float freq = texture(iChannel0, vec2(freqX, 0.25)).r;

  float inner = 0.25;
  float outer = inner + freq * 0.55;

  float ring = smoothstep(inner - 0.015, inner, radius)
             * smoothstep(outer + 0.015, outer, radius);

  // Rainbow based on angle
  vec3 col = 0.5 + 0.5 * cos(angle + vec3(0.0, 2.094, 4.189) + iTime * 0.4);

  // Center glow from bass
  float glow = 0.04 / (radius + 0.04) * iBass;

  fragColor = vec4(col * ring * (0.5 + freq) + vec3(glow), 1.0);
}
`,
  },

  // ── 4. Audio Plasma ───────────────────────────────────────────
  {
    name: 'Audio Plasma',
    fragmentShader: `
void main() {
  vec2 uv = vUv * 2.0 - 1.0;
  uv.x *= iResolution.x / iResolution.y;

  float t = iTime * 0.5;

  float v  = sin(uv.x * 5.0 + t + iBass * 3.0);
  v       += sin(uv.y * 5.0 + t * 1.3);
  v       += sin((uv.x + uv.y) * 5.0 + t * 0.7);
  v       += sin(length(uv + vec2(sin(t), cos(t * 0.7))) * 7.0);
  v       *= 0.25;

  // Audio drives intensity
  v *= 0.3 + iBass * 0.7 + iMid * 0.3;

  vec3 col = 0.5 + 0.5 * cos(v * 6.283 + vec3(0.0, 2.094, 4.189) + iTime * 0.3);
  col *= 0.8 + iBeat * 0.5;

  fragColor = vec4(col, 1.0);
}
`,
  },

  // ── 5. Tunnel Vortex ──────────────────────────────────────────
  {
    name: 'Tunnel Vortex',
    fragmentShader: `
void main() {
  vec2 uv = vUv * 2.0 - 1.0;
  uv.x *= iResolution.x / iResolution.y;

  float angle  = atan(uv.y, uv.x);
  float radius = length(uv);

  // Tunnel mapping
  float depth = 0.5 / (radius + 0.001);
  float twist = angle / 3.14159 + depth * 0.15 * sin(iTime * 0.4);

  float freq = texture(iChannel0, vec2(fract(depth * 0.08 + iTime * 0.04), 0.25)).r;

  // Ring + twist pattern
  float p = sin(depth * 3.0 - iTime * 2.0) * 0.5 + 0.5;
  p *= sin(twist * 8.0) * 0.5 + 0.5;

  vec3 col = 0.5 + 0.5 * cos(
    vec3(depth * 0.5, twist, depth * 0.3 + twist)
    + iTime * 0.3
    + vec3(0.0, 2.094, 4.189)
  );

  col *= p * freq * 2.0;
  col *= smoothstep(0.0, 0.2, radius);   // fade outer edge vignette inward
  col *= smoothstep(0.01, 0.15, radius);  // darken center singularity
  col *= 0.8 + iBeat * 0.4;

  fragColor = vec4(col, 1.0);
}
`,
  },

  // ── 6. Feedback Trails ────────────────────────────────────────
  {
    name: 'Feedback Trails',
    fragmentShader: `
void main() {
  vec2 uv = vUv;
  vec2 center = vec2(0.5);

  // Zoom + rotate the previous frame slightly
  vec2 fbUv = (uv - center) * (0.98 + iBass * 0.01) + center;
  float rotAngle = 0.003 + iBeat * 0.01;
  float cs = cos(rotAngle), sn = sin(rotAngle);
  fbUv = center + mat2(cs, -sn, sn, cs) * (fbUv - center);

  // Sample feedback (previous frame)
  vec3 prev = texture(iBackbuffer, fbUv).rgb * 0.96;

  // New content: frequency-driven particles along a circle
  vec2 p = uv * 2.0 - 1.0;
  p.x *= iResolution.x / iResolution.y;
  float angle = atan(p.y, p.x);
  float r = length(p);
  float normA = (angle + 3.14159) / (2.0 * 3.14159);
  float freqX = pow(normA, 3.0);
  float freq = texture(iChannel0, vec2(freqX, 0.25)).r;

  // Ring of frequency
  float ring = smoothstep(0.02, 0.0, abs(r - 0.3 - freq * 0.25)) * freq;
  vec3 ringCol = 0.5 + 0.5 * cos(angle + iTime * 0.5 + vec3(0, 2.094, 4.189));

  vec3 col = max(prev, ringCol * ring * 1.5);
  fragColor = vec4(col, 1.0);
}
`,
  },

  // ── 7. Warp Feedback ──────────────────────────────────────────
  {
    name: 'Warp Feedback',
    fragmentShader: `
void main() {
  vec2 uv = vUv;
  vec2 center = vec2(0.5);
  vec2 dir = uv - center;

  // Warp the feedback UV based on audio
  float warpAmt = 0.005 + iBass * 0.015;
  vec2 fbUv = uv - dir * warpAmt;

  // Slight rotation driven by spectral centroid
  float rot = (iSpectralCentroid - 0.5) * 0.02;
  float c = cos(rot), s = sin(rot);
  fbUv = center + mat2(c, -s, s, c) * (fbUv - center);

  vec3 prev = texture(iBackbuffer, fbUv).rgb;

  // Colour-shift the feedback over time
  prev.rgb = prev.gbr * 0.97; // rotate colour channels + fade

  // Draw waveform as bright line
  float wave = texture(iChannel0, vec2(uv.x, 0.75)).r;
  float y = (wave - 0.5) * 1.5;
  float dist = abs(uv.y - 0.5 - y);
  float line = 0.004 / (dist + 0.004);

  vec3 lineCol = 0.6 + 0.4 * cos(iTime * 0.3 + vec3(0, 2, 4));
  vec3 col = prev + lineCol * line * 0.4;

  fragColor = vec4(col, 1.0);
}
`,
  },

  // ── 8. Kaleidoscope ───────────────────────────────────────────
  {
    name: 'Kaleidoscope',
    fragmentShader: `
void main() {
  vec2 uv = vUv * 2.0 - 1.0;
  uv.x *= iResolution.x / iResolution.y;

  // Convert to polar
  float angle = atan(uv.y, uv.x);
  float r = length(uv);

  // Kaleidoscope fold (6 segments)
  float segments = 6.0;
  angle = mod(angle, 6.283 / segments);
  angle = abs(angle - 3.14159 / segments);

  // Back to cartesian for feedback sampling
  vec2 kUv = vec2(cos(angle), sin(angle)) * r * 0.5 + 0.5;

  // Zoom and rotate feedback
  vec2 center = vec2(0.5);
  vec2 fbUv = (kUv - center) * (0.99 - iBeat * 0.02) + center;
  vec3 prev = texture(iBackbuffer, fbUv).rgb * 0.95;

  // New: audio-reactive shapes
  float freq = texture(iChannel0, vec2(r * 0.5, 0.25)).r;
  float shape = smoothstep(0.02, 0.0, abs(r - 0.2 - freq * 0.4));

  vec3 newCol = 0.5 + 0.5 * cos(angle * 3.0 + iTime + vec3(0, 2.094, 4.189));
  newCol *= shape * freq * 2.0;

  vec3 col = max(prev, newCol);
  col *= 0.85 + iBeat * 0.3;

  fragColor = vec4(col, 1.0);
}
`,
  },

  // ╔══════════════════════════════════════════════════════════════╗
  // ║  EDUCATIONAL PRESETS                                        ║
  // ║  Each one teaches a specific concept with inline comments.  ║
  // ╚══════════════════════════════════════════════════════════════╝

  // ── 9. [Learn] FFT Frequency Map ──────────────────────────────
  {
    name: '[Learn] FFT Frequency Map',
    fragmentShader: `// This preset visualizes the raw FFT data so you can see exactly
// what's in iChannel0.
//
// The texture is 512 pixels wide × 2 pixels tall:
//   Row 0 (sample at y=0.25): FFT magnitude spectrum
//   Row 1 (sample at y=0.75): PCM waveform
//
// X axis = frequency bin index (0–511).
//   At 44100 Hz sample rate, fftSize=1024: each bin ≈ 43 Hz.
//   x=0.0 → 0 Hz (DC), x=0.5 → ~11 kHz, x=1.0 → ~22 kHz
//
// Why y=0.25 and not y=0.0?  The texture uses LINEAR filtering
// and is 2 pixels tall.  OpenGL texel centers are at:
//   row 0 center = (0+0.5)/2 = 0.25
//   row 1 center = (1+0.5)/2 = 0.75
// Sampling at y=0.5 would blend both rows (useless).
//
// IMPORTANT: The FFT bins are linearly spaced (~43 Hz each), but
// human hearing is logarithmic.  Most music lives below ~4 kHz
// (bin ~93 out of 512).  Using uv.x directly means the right 80%
// of the screen is nearly empty.  We use pow(x, 3.0) to give
// more screen space to low/mid frequencies where the action is.

void main() {
  vec2 uv = vUv;

  // ── Log-frequency mapping ──
  // pow(x, 3.0) spreads bass/mid across most of the screen width.
  float freqX = pow(uv.x, 3.0);

  // ── Top half: FFT frequency spectrum ──
  float fft = texture(iChannel0, vec2(freqX, 0.25)).r;

  // ── Bottom half: PCM waveform (time-domain, linear x is correct) ──
  float wave = texture(iChannel0, vec2(uv.x, 0.75)).r;

  vec3 col = vec3(0.0);

  if (uv.y > 0.52) {
    // --- Upper region: FFT bars ---
    float barY = (uv.y - 0.52) / 0.48;   // remap to 0–1
    float bar = step(barY, fft);          // lit if barY < fft
    // Colour from blue (low freq) → red (high freq)
    col = mix(vec3(0.2, 0.5, 1.0), vec3(1.0, 0.2, 0.3), uv.x) * bar;
    // Glow at bar edge
    col += vec3(0.6) * exp(-40.0 * abs(barY - fft)) * fft;
  } else if (uv.y < 0.48) {
    // --- Lower region: Waveform oscilloscope ---
    float waveY = (uv.y / 0.48);         // remap to 0–1
    float dist = abs(waveY - wave);       // distance from wave value
    float line = 0.003 / (dist + 0.003);  // thin glowing line
    col = vec3(0.3, 1.0, 0.5) * line;
  } else {
    // --- Divider line ---
    col = vec3(0.15);
  }

  fragColor = vec4(col, 1.0);
}
`,
  },

  // ── 10. [Learn] Uniforms Dashboard ─────────────────────────────
  {
    name: '[Learn] Uniforms Dashboard',
    fragmentShader: `// This preset shows every audio uniform as a visual bar.
// It helps you understand what each value does:
//   iBass   — low frequency energy (kick drums, bass guitar)
//   iMid    — mid frequency energy (vocals, guitars, snare)
//   iTreble — high frequency energy (cymbals, hi-hats, sibilance)
//   iBeat   — spikes on transients (onset detection)
//   iSpectralCentroid — perceived brightness of sound (0=bassy, 1=bright)
//   iBPM    — estimated beats per minute

// Helper: draw a horizontal bar
float hbar(vec2 uv, float row, float val, float rows) {
  float h = 1.0 / rows;
  float y0 = 1.0 - (row + 1.0) * h;
  float inRow = smoothstep(y0 + 0.005, y0 + 0.01, uv.y)
              * smoothstep(y0 + h - 0.005, y0 + h - 0.01, uv.y);
  float bar = step(uv.x, val) * inRow;
  float edge = exp(-200.0 * abs(uv.x - val)) * inRow * 0.5;
  return bar + edge;
}

void main() {
  vec2 uv = vUv;
  float rows = 6.0;
  vec3 col = vec3(0.04);

  // Row 0: iBass (red)
  col += vec3(0.9, 0.2, 0.2) * hbar(uv, 0.0, iBass, rows);
  // Row 1: iMid (green)
  col += vec3(0.2, 0.9, 0.3) * hbar(uv, 1.0, iMid, rows);
  // Row 2: iTreble (blue)
  col += vec3(0.2, 0.4, 1.0) * hbar(uv, 2.0, iTreble, rows);
  // Row 3: iBeat (magenta — flashes on beats)
  col += vec3(1.0, 0.3, 0.8) * hbar(uv, 3.0, iBeat, rows);
  // Row 4: iSpectralCentroid (gold)
  col += vec3(1.0, 0.8, 0.2) * hbar(uv, 4.0, iSpectralCentroid, rows);
  // Row 5: iBPM (cyan, normalized to 0–1 assuming 60–200 range)
  float bpmNorm = clamp((iBPM - 60.0) / 140.0, 0.0, 1.0);
  col += vec3(0.2, 0.9, 0.9) * hbar(uv, 5.0, bpmNorm, rows);

  // Grid lines at 0.25, 0.5, 0.75
  for (float g = 0.25; g < 1.0; g += 0.25) {
    col += vec3(0.08) * (1.0 - smoothstep(0.0, 0.002, abs(uv.x - g)));
  }

  fragColor = vec4(col, 1.0);
}
`,
  },

  // ── 11. [Learn] UV & Coordinates ───────────────────────────────
  {
    name: '[Learn] UV & Coordinates',
    fragmentShader: `// This preset teaches how UV coordinates and screen space work.
//
// vUv is a vec2 that goes from (0,0) at bottom-left to (1,1) at top-right.
// It's the most important variable for positioning anything on screen.
//
// Common patterns:
//   Centered coords:  vec2 p = vUv * 2.0 - 1.0   → range -1 to +1
//   Aspect-correct:   p.x *= iResolution.x / iResolution.y
//   Polar coords:     float angle = atan(p.y, p.x);  float r = length(p);

void main() {
  vec2 uv = vUv;

  // ── Layer 1: Background gradient shows raw UV ──
  // Red = x position, Green = y position
  vec3 col = vec3(uv.x * 0.3, uv.y * 0.3, 0.1);

  // ── Layer 2: Grid lines every 0.1 ──
  vec2 grid = fract(uv * 10.0);
  float gridLine = 1.0 - smoothstep(0.0, 0.02, min(grid.x, grid.y));
  col += vec3(0.12) * gridLine;

  // ── Layer 3: Center crosshair at (0.5, 0.5) ──
  float cx = 1.0 - smoothstep(0.0, 0.003, abs(uv.x - 0.5));
  float cy = 1.0 - smoothstep(0.0, 0.003, abs(uv.y - 0.5));
  col += vec3(0.5, 0.5, 0.0) * (cx + cy) * 0.3;

  // ── Layer 4: Aspect-corrected circle reacting to bass ──
  vec2 p = uv * 2.0 - 1.0;                           // centered -1 to +1
  p.x *= iResolution.x / iResolution.y;               // fix aspect ratio
  float r = length(p);                                 // distance from center
  float circle = smoothstep(0.32 + iBass * 0.1, 0.30 + iBass * 0.1, r);
  col += vec3(0.3, 0.6, 1.0) * circle * 0.5;

  // ── Layer 5: Polar angle indicator ──
  float angle = atan(p.y, p.x);                       // -PI to +PI
  float spoke = 1.0 - smoothstep(0.0, 0.02, abs(sin(angle * 4.0)));
  col += vec3(0.15) * spoke * step(r, 0.28) * step(0.05, r);

  fragColor = vec4(col, 1.0);
}
`,
  },

  // ── 12. [Learn] Beat Pulse ─────────────────────────────────────
  {
    name: '[Learn] Beat Pulse',
    fragmentShader: `// This preset demonstrates beat detection and how iBeat works.
//
// iBeat is 0.0 most of the time, then spikes toward 1.0 on transients
// (kick drums, snare hits, any sudden energy increase).
// It decays back to 0 quickly — it's an impulse, not sustained.
//
// Technique: use iBeat to drive scale, brightness, or colour shifts.
// Use iBackbuffer (previous frame) with slight fade for motion trails.

void main() {
  vec2 uv = vUv * 2.0 - 1.0;
  uv.x *= iResolution.x / iResolution.y;

  // ── Feedback: fade previous frame ──
  vec2 fbUv = vUv * 0.5 + 0.25;   // zoom into center of previous frame
  vec3 prev = texture(iBackbuffer, vUv).rgb * (0.85 + iBeat * 0.1);

  // ── Pulsing ring: radius driven by iBeat ──
  float r = length(uv);
  float ringR = 0.15 + iBeat * 0.6;      // ring expands on beat
  float ring = smoothstep(0.03, 0.0, abs(r - ringR));

  // Ring colour shifts with spectral centroid
  vec3 ringCol = 0.5 + 0.5 * cos(iTime + vec3(0, 2, 4) + iSpectralCentroid * 3.0);

  // ── Center dot: bright on beat ──
  float dot = 0.01 / (r * r + 0.01) * iBeat;

  // ── Combine ──
  vec3 col = prev * 0.92;                 // trails
  col += ringCol * ring * 1.5;            // expanding ring
  col += vec3(1.0, 0.9, 0.8) * dot;      // center flash

  fragColor = vec4(col, 1.0);
}
`,
  },

  // ── 13. [Learn] Feedback Buffer ────────────────────────────────
  {
    name: '[Learn] Feedback Buffer',
    fragmentShader: `// This preset teaches iBackbuffer — the previous frame's output.
//
// Each frame, the GPU renders your shader to an off-screen texture (FBO).
// Next frame, that texture becomes iBackbuffer.
// By reading iBackbuffer and writing a slightly modified version,
// you create persistence, trails, motion blur, and feedback loops.
//
// Key technique: sample iBackbuffer at a slightly offset UV to create
// motion (zoom, rotate, shift).  Multiply by <1.0 to fade over time.

void main() {
  vec2 uv = vUv;
  vec2 center = vec2(0.5);

  // ── Read previous frame with slight inward zoom ──
  // (uv - center) * 0.99 shrinks toward center → zoom-in trail effect.
  // Try changing 0.99 to 1.01 for zoom-out, or add rotation:
  vec2 offset = (uv - center) * 0.985;

  // Add slow rotation
  float a = 0.005;
  float c = cos(a), s = sin(a);
  offset = mat2(c, -s, s, c) * offset;

  vec3 prev = texture(iBackbuffer, center + offset).rgb;

  // Fade: multiply by <1.0 so old frames gradually disappear.
  // Higher = longer trails.  0.96 = moderate, 0.99 = very long.
  prev *= 0.96;

  // ── Draw new content: a dot orbiting the center ──
  vec2 p = uv * 2.0 - 1.0;
  p.x *= iResolution.x / iResolution.y;

  // Orbit position driven by time + bass
  float angle = iTime * 1.5;
  float orbitR = 0.3 + iBass * 0.15;
  vec2 dotPos = vec2(cos(angle), sin(angle)) * orbitR;

  float d = length(p - dotPos);
  float glow = 0.008 / (d * d + 0.008);

  // Dot colour cycles over time
  vec3 dotCol = 0.5 + 0.5 * cos(iTime * 0.4 + vec3(0, 2.094, 4.189));

  // ── Combine: max keeps the brightest of trail or new dot ──
  vec3 col = max(prev, dotCol * glow);

  fragColor = vec4(col, 1.0);
}
`,
  },

  // ── 14. [Learn] Frequency Bands ────────────────────────────────
  {
    name: '[Learn] Frequency Bands',
    fragmentShader: `// This preset shows the difference between reading frequency data
// from individual FFT bins vs using the pre-computed band uniforms.
//
// LEFT SIDE: Raw FFT bins from iChannel0 texture
//   - 512 bins, each ≈ 43 Hz wide (at 44100 Hz sample rate)
//   - Low frequencies (bass) are in the leftmost bins
//   - Most musical energy is in the first ~100 bins (0–4300 Hz)
//   - The upper bins (4300–22050 Hz) are often very quiet
//
// RIGHT SIDE: Pre-computed uniforms (iBass, iMid, iTreble)
//   - These average across many bins so they're smoother
//   - iBass  = bins 0–5   ≈ 0–260 Hz    (kick, bass guitar)
//   - iMid   = bins 6–92  ≈ 260–4000 Hz (vocals, guitar, snare body)
//   - iTreble= bins 93–370≈ 4000–16 kHz (cymbals, sibilance, air)

void main() {
  vec2 uv = vUv;
  vec3 col = vec3(0.03);

  if (uv.x < 0.48) {
    // ── Left half: raw FFT with log-frequency scale ──
    // Use pow() to expand the low-frequency bins (where the action is)
    float freqX = pow(uv.x / 0.48, 2.0);  // quadratic → more space for bass
    float fft = texture(iChannel0, vec2(freqX, 0.25)).r;
    float bar = step(uv.y, fft);

    // Colour encodes approximate frequency range
    vec3 barCol = freqX < 0.012 ? vec3(1.0, 0.3, 0.3)    // bass (red)
               : freqX < 0.18  ? vec3(0.3, 1.0, 0.4)     // mid (green)
               :                  vec3(0.3, 0.5, 1.0);    // treble (blue)
    col = barCol * bar * 0.8;

    // Glow at bar edge
    col += barCol * exp(-30.0 * abs(uv.y - fft)) * fft * 0.5;

  } else if (uv.x > 0.52) {
    // ── Right half: band energy bars ──
    float rx = (uv.x - 0.52) / 0.48;      // remap to 0–1
    float third = 1.0 / 3.0;

    if (rx < third - 0.01) {
      float bar = step(uv.y, iBass);
      col = vec3(1.0, 0.3, 0.3) * bar;
      col += vec3(1.0, 0.3, 0.3) * exp(-20.0 * abs(uv.y - iBass)) * 0.5;
    } else if (rx > third + 0.01 && rx < 2.0 * third - 0.01) {
      float bar = step(uv.y, iMid);
      col = vec3(0.3, 1.0, 0.4) * bar;
      col += vec3(0.3, 1.0, 0.4) * exp(-20.0 * abs(uv.y - iMid)) * 0.5;
    } else if (rx > 2.0 * third + 0.01) {
      float bar = step(uv.y, iTreble);
      col = vec3(0.3, 0.5, 1.0) * bar;
      col += vec3(0.3, 0.5, 1.0) * exp(-20.0 * abs(uv.y - iTreble)) * 0.5;
    }
  } else {
    // Divider
    col = vec3(0.1);
  }

  fragColor = vec4(col, 1.0);
}
`,
  },
];
