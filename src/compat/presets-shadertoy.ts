/**
 * Built-in presets written in ShaderToy format.
 *
 * These use `mainImage(out vec4 fragColor, in vec2 fragCoord)` and
 * ShaderToy uniform conventions.  They are wrapped by the ShaderToy
 * adapter at load time to demonstrate compatibility.
 */

import { wrapShaderToyCode } from './shadertoy';
import type { Preset } from '../renderer/shaders';

/**
 * Raw ShaderToy-format shader code.
 * Each entry has a name and the original ShaderToy GLSL source.
 */
const RAW_SHADERTOY_PRESETS: { name: string; code: string }[] = [
  {
    name: '[ST] Audio Rings',
    code: `// ShaderToy-style audio rings visualizer.
// Uses mainImage() entry point and iResolution as vec3.

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

    float r = length(uv);
    float a = atan(uv.y, uv.x);

    // Sample audio spectrum based on radius
    float freq = texture(iChannel0, vec2(r * 0.5, 0.25)).r;

    // Concentric rings modulated by audio
    float ring = sin(r * 30.0 - iTime * 3.0 + freq * 10.0);
    ring = smoothstep(0.0, 0.1, abs(ring) - 0.3 + freq * 0.6);

    // Colour based on angle + audio
    vec3 col = 0.5 + 0.5 * cos(a + iTime * 0.3 + vec3(0, 2.094, 4.189));
    col *= (1.0 - ring) * freq * 1.8;

    // Center glow
    col += vec3(0.9, 0.6, 0.3) * 0.02 / (r + 0.02) * freq;

    fragColor = vec4(col, 1.0);
}`,
  },
  {
    name: '[ST] Frequency Terrain',
    code: `// ShaderToy-style raymarched audio terrain.
// The landscape height comes from the audio FFT data.

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord.xy / iResolution.xy;
    uv = uv * 2.0 - 1.0;
    uv.x *= iResolution.x / iResolution.y;

    // "Camera" looking at the frequency terrain
    vec3 col = vec3(0.0);
    float totalDist = 0.0;

    for (int i = 0; i < 60; i++) {
        float z = float(i) * 0.04 + iTime * 0.5;
        float zFrac = fract(z * 0.1);

        // Sample FFT at this depth
        float freq = texture(iChannel0, vec2(zFrac, 0.25)).r;

        // Terrain height
        float height = freq * 0.6 - 0.1;
        float x = uv.x * (1.0 + float(i) * 0.02);
        float y = uv.y - height + float(i) * 0.015;

        // Distance-based fog
        float fog = exp(-float(i) * 0.04);

        // Horizontal frequency bars at different depths
        float bar = smoothstep(0.02, 0.0, abs(y)) * fog;

        vec3 barCol = 0.5 + 0.5 * cos(zFrac * 6.28 + vec3(0, 2, 4));
        col += barCol * bar * freq * 0.8;
    }

    fragColor = vec4(col, 1.0);
}`,
  },
  {
    name: '[ST] Waveform Tunnel',
    code: `// ShaderToy-style waveform tunnel.
// Samples the PCM waveform to distort a tunnel effect.

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    float r = length(uv);
    float a = atan(uv.y, uv.x);

    // Tunnel depth
    float depth = 0.4 / (r + 0.001);

    // Sample waveform based on angle
    float normA = (a + 3.14159) / (2.0 * 3.14159);
    float wave = texture(iChannel0, vec2(normA, 0.75)).r;
    wave = (wave - 0.5) * 2.0;

    // Distort tunnel with waveform
    depth += wave * 0.3;
    float twist = a + depth * 0.1 * sin(iTime * 0.3);

    // Pattern
    float pattern = sin(depth * 4.0 - iTime * 2.0) * cos(twist * 6.0);
    pattern = smoothstep(-0.1, 0.1, pattern);

    // Audio-reactive colour
    float freq = texture(iChannel0, vec2(abs(wave) * 0.5, 0.25)).r;
    vec3 col = 0.5 + 0.5 * cos(depth * 0.3 + iTime * 0.2 + vec3(0, 2, 4));
    col *= pattern * (0.5 + freq);

    // Vignette
    col *= smoothstep(0.0, 0.2, r);
    col *= smoothstep(2.5, 0.5, r);

    fragColor = vec4(col, 1.0);
}`,
  },
  {
    name: '[ST] Neon Spectrum Bars',
    code: `// ShaderToy-style neon spectrum bars with reflection.

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord.xy / iResolution.xy;

    // Number of bars
    float bars = 32.0;
    float barIdx = floor(uv.x * bars);
    float barCenter = (barIdx + 0.5) / bars;

    // Log-frequency mapping
    float freqX = pow(barCenter, 3.0);
    float freq = texture(iChannel0, vec2(freqX, 0.25)).r;

    // Bar height
    float barWidth = 0.7 / bars;
    float barEdge = abs(uv.x - barCenter) - barWidth * 0.5;
    float inBar = smoothstep(0.002, 0.0, barEdge);

    // Main bar (bottom half going up)
    float barHeight = freq;
    float mainBar = step(uv.y, barHeight * 0.5 + 0.5) * step(0.5, uv.y);

    // Reflection (top half, mirrored, faded)
    float refY = 1.0 - uv.y;
    float reflection = step(refY, barHeight * 0.5 + 0.5) * step(0.5, refY) * 0.3;

    float bar = (mainBar + reflection) * inBar;

    // Colour gradient per bar
    vec3 barCol = 0.5 + 0.5 * cos(barCenter * 6.28 + iTime * 0.5 + vec3(0, 2, 4));

    // Glow at bar tip
    float tipY = barHeight * 0.5 + 0.5;
    float glow = exp(-40.0 * abs(uv.y - tipY)) * inBar * freq;

    vec3 col = barCol * bar + barCol * glow * 0.6;

    // Subtle center line
    col += vec3(0.05) * smoothstep(0.003, 0.0, abs(uv.y - 0.5));

    fragColor = vec4(col, 1.0);
}`,
  },
  {
    name: '[ST] Sound Galaxy',
    code: `// ShaderToy-style spiraling galaxy driven by audio.

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    float r = length(uv);
    float a = atan(uv.y, uv.x);

    // Spiral arms
    float arms = 3.0;
    float spiral = a * arms + r * 12.0 - iTime * 1.5;
    float armPattern = sin(spiral) * 0.5 + 0.5;

    // Audio modulation
    float freqR = pow(clamp(r * 1.5, 0.0, 1.0), 2.0);
    float freq = texture(iChannel0, vec2(freqR, 0.25)).r;

    // Star field density varies with audio
    float stars = armPattern * freq;
    stars = pow(stars, 3.0) * 4.0;

    // Colour varies by angle and radius
    vec3 col = 0.5 + 0.5 * cos(a * 0.5 + r * 2.0 + iTime * 0.2 + vec3(0, 2.094, 4.189));
    col *= stars;

    // Central bulge
    float bulge = 0.04 / (r * r + 0.04);
    float bassFreq = texture(iChannel0, vec2(0.02, 0.25)).r;
    col += vec3(1.0, 0.8, 0.5) * bulge * bassFreq * 0.5;

    // Fade edges
    col *= smoothstep(1.2, 0.3, r);

    fragColor = vec4(col, 1.0);
}`,
  },
];

/** Pre-wrapped ShaderToy presets ready for NewAmp. */
export const shaderToyPresets: Preset[] = RAW_SHADERTOY_PRESETS.map((raw) => ({
  name: raw.name,
  fragmentShader: wrapShaderToyCode(raw.code),
}));
