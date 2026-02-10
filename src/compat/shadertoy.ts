/**
 * ShaderToy compatibility adapter.
 *
 * Bridges the differences between ShaderToy's shader API and NewAmp's:
 *
 *   ShaderToy                          NewAmp
 *   ─────────────────────────────────  ──────────────────────────
 *   void mainImage(out vec4, in vec2)  void main()
 *   fragCoord (pixel coords)           vUv (0–1 normalized)
 *   iResolution (vec3)                 iResolution (vec2)
 *   iFrame (int)                       iFrame (float)
 *   iMouse (vec4)                      (not available — stubbed)
 *   gl_FragCoord                       (available via vUv * iResolution)
 *   fragColor = ...                    fragColor = ... (same output)
 *
 * The adapter prepends a compatibility preamble that re-declares the
 * differing uniforms and defines a main() that calls mainImage().
 */

/** Detection heuristics for ShaderToy code. */
export function isShaderToyCode(code: string): boolean {
  // Primary signal: contains mainImage function signature
  if (/void\s+mainImage\s*\(\s*out\s+vec4/.test(code)) return true;
  // Secondary: uses fragCoord as a parameter name (common in ST shaders)
  if (/fragCoord/i.test(code) && /mainImage/.test(code)) return true;
  return false;
}

/**
 * GLSL preamble injected *between* the NewAmp FRAGMENT_HEADER and the
 * user's ShaderToy code.  It provides the missing uniforms / macros and
 * defines main() as a trampoline to mainImage().
 *
 * Because NewAmp's header already declares iTime, iTimeDelta, iChannel0,
 * iBass, etc., we only need to add the ShaderToy-specific bits.
 */
export const SHADERTOY_PREAMBLE = `
// ── ShaderToy compatibility shim ──────────────────────────────────────
// Provides uniforms and entry-point bridging so most ShaderToy shaders
// compile and run unmodified in NewAmp.

// ShaderToy iResolution is vec3 (z = pixel aspect, usually 1.0).
// NewAmp provides vec2; we shadow it here with a vec3.
#define iResolution_ST vec3(iResolution, 1.0)

// ShaderToy iFrame is int; NewAmp provides float.
#define iFrame_ST int(iFrame)

// Stub iMouse (ShaderToy provides click/drag coords; we have none).
const vec4 iMouse = vec4(0.0);

// ShaderToy's iChannelResolution for channel 0 (our 512×2 audio texture).
const vec3 iChannelResolution_0 = vec3(512.0, 2.0, 1.0);
#define iChannelResolution vec3[1](iChannelResolution_0)

// gl_FragCoord is available natively, but some ST shaders reference
// fragCoord from mainImage params — that's handled by the main() wrapper.

// iDate stub (year, month, day, seconds-since-midnight)
const vec4 iDate = vec4(2025.0, 1.0, 1.0, 0.0);

// iSampleRate stub
const float iSampleRate = 44100.0;

`;

/**
 * Wraps ShaderToy code so it compiles under NewAmp's pipeline.
 *
 * 1. Injects the compatibility preamble.
 * 2. Replaces references to the vec3 iResolution with our shim.
 * 3. Appends a main() that calls mainImage(fragColor, gl_FragCoord.xy).
 */
export function wrapShaderToyCode(stCode: string): string {
  // Replace bare iResolution references with the vec3 shim,
  // but not inside our own preamble (which uses iResolution directly).
  let adapted = stCode.replace(/\biResolution\b/g, 'iResolution_ST');

  // Replace iFrame with the int shim where it appears in user code
  adapted = adapted.replace(/\biFrame\b/g, 'iFrame_ST');

  // Build the final shader body (appended after FRAGMENT_HEADER by the renderer)
  return (
    SHADERTOY_PREAMBLE +
    adapted +
    `

// ── ShaderToy entry-point bridge ──
void main() {
  mainImage(fragColor, gl_FragCoord.xy);
}
`
  );
}

/**
 * Attempt to auto-detect and wrap shader code.
 * Returns { wrapped, format } where format is 'shadertoy' | 'native'.
 */
export function adaptShaderCode(
  code: string,
): { code: string; format: 'shadertoy' | 'native' } {
  if (isShaderToyCode(code)) {
    return { code: wrapShaderToyCode(code), format: 'shadertoy' };
  }
  return { code, format: 'native' };
}

/** Number of lines in SHADERTOY_PREAMBLE (for error-line offset mapping). */
export const SHADERTOY_PREAMBLE_LINES = SHADERTOY_PREAMBLE.split('\n').length - 1;
