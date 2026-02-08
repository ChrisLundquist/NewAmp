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
uniform sampler2D iChannel0;   // row 0 (y≈0.25) = FFT, row 1 (y≈0.75) = waveform
uniform float     iBass;
uniform float     iMid;
uniform float     iTreble;
uniform float     iBeat;
uniform float     iSpectralCentroid;
uniform float     iBPM;

in  vec2 vUv;
out vec4 fragColor;
`;

export const presets: Preset[] = [
  // ── 1. Spectrum Bars ──────────────────────────────────────────
  {
    name: 'Spectrum Bars',
    fragmentShader: `
void main() {
  vec2 uv = vUv;
  float freq = texture(iChannel0, vec2(uv.x, 0.25)).r;

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

  // Map angle to 0-1 for texture lookup
  float a = (angle + 3.14159) / (2.0 * 3.14159);
  float freq = texture(iChannel0, vec2(a, 0.25)).r;

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
];
