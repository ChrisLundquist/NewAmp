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
 *   iChannel0–3 (sampler2D)            iChannel0 + iBackbuffer
 *   gl_FragCoord                       (available via vUv * iResolution)
 *   fragColor = ...                    fragColor = ... (same output)
 *
 * Multi-pass support: ShaderToy shaders may have multiple buffers
 * (Buffer A, B, C, D + Image).  When pasted together they contain
 * multiple mainImage() definitions.  We detect this and either:
 *   - Use only the last mainImage (the Image pass), renaming earlier
 *     ones so they still compile as helper functions.
 *   - Or merge them into a single-pass approximation.
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

// ShaderToy channels 1–3: not available in NewAmp, stub to existing textures.
// iChannel0 = audio texture (512x2 R8, provided by NewAmp FRAGMENT_HEADER).
// iChannel1 = backbuffer (previous frame — useful fallback for feedback/image shaders).
// iChannel2/3 = audio texture again (returns valid data for texture/texelFetch).
#define iChannel1 iBackbuffer
#define iChannel2 iChannel0
#define iChannel3 iChannel0

// ShaderToy's iChannelResolution — array of vec3 for all 4 channels.
// channel 0: 512×2 audio texture
// channel 1: backbuffer (approximate with viewport resolution)
// channel 2/3: same as channel 0
vec3 iChannelResolution[4] = vec3[4](
  vec3(512.0, 2.0, 1.0),
  vec3(iResolution, 1.0),
  vec3(512.0, 2.0, 1.0),
  vec3(512.0, 2.0, 1.0)
);

// gl_FragCoord is available natively, but some ST shaders reference
// fragCoord from mainImage params — that's handled by the main() wrapper.

// iDate stub (year, month, day, seconds-since-midnight)
const vec4 iDate = vec4(2025.0, 1.0, 1.0, 0.0);

// iSampleRate stub
const float iSampleRate = 44100.0;

// iChannelTime stubs (per-channel playback time)
float iChannelTime[4] = float[4](iTime, iTime, iTime, iTime);

`;

// ──────────────────────────────────────────────────────────────────────
// Multi-pass detection and handling
// ──────────────────────────────────────────────────────────────────────

/**
 * Find all mainImage function definitions in the code.
 * Returns their positions (start index of the match).
 */
function findMainImageDefs(code: string): { index: number; length: number }[] {
  const results: { index: number; length: number }[] = [];
  const re = /void\s+mainImage\s*\(\s*out\s+vec4\s+\w+\s*,\s*in\s+vec2\s+\w+\s*\)/g;
  let match;
  while ((match = re.exec(code)) !== null) {
    results.push({ index: match.index, length: match[0].length });
  }
  return results;
}

/**
 * For multi-pass ShaderToy shaders (multiple mainImage definitions),
 * rename all but the last one to _mainImage_passN.
 *
 * The last mainImage is treated as the "Image" pass (final output).
 * Earlier passes become helper functions that the Image pass may call,
 * but since we don't have multi-buffer support, they'll mostly be
 * dead code — which is fine, it just needs to compile.
 */
function handleMultiPass(code: string): string {
  const defs = findMainImageDefs(code);
  if (defs.length <= 1) return code;

  // Rename all but the last mainImage
  // Work backwards to preserve string indices
  let result = code;
  for (let i = defs.length - 2; i >= 0; i--) {
    const def = defs[i];
    // Replace "void mainImage" with "void _mainImage_passN"
    const before = result.slice(0, def.index);
    const signature = result.slice(def.index, def.index + def.length);
    const after = result.slice(def.index + def.length);
    const renamed = signature.replace('mainImage', `_mainImage_pass${i}`);
    result = before + renamed + after;
  }

  return result;
}

/**
 * Wraps ShaderToy code so it compiles under NewAmp's pipeline.
 *
 * 1. Handles multi-pass shaders (renames extra mainImage defs).
 * 2. Injects the compatibility preamble.
 * 3. Replaces references to the vec3 iResolution with our shim.
 * 4. Appends a main() that calls mainImage(fragColor, gl_FragCoord.xy).
 */
export function wrapShaderToyCode(stCode: string): string {
  // Handle multiple mainImage definitions (multi-pass/multi-buffer)
  let adapted = handleMultiPass(stCode);

  // Replace bare iResolution references with the vec3 shim,
  // but not inside our own preamble (which uses iResolution directly).
  adapted = adapted.replace(/\biResolution\b/g, 'iResolution_ST');

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
