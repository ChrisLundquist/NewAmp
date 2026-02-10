/**
 * MilkDrop compatibility shim.
 *
 * MilkDrop 2 presets contain HLSL pixel shaders (warp + composite).
 * This module provides:
 *
 *   1. HLSL → GLSL translation for common MilkDrop shader patterns
 *   2. Uniform mapping from MilkDrop names to NewAmp equivalents
 *   3. A compatibility preamble that defines MilkDrop-style variables
 *
 * Full .milk preset parsing (EEL2 equations, per-vertex mesh, custom
 * shapes/waves) requires Butterchurn and is out of scope here.  This
 * module targets the "Tier 1" use case: extracting and running the
 * HLSL pixel shaders from MilkDrop 2 presets.
 *
 * Reference: MilkDrop shader uniform list
 *   time, fps, frame, progress, bass, bass_att, mid, mid_att, treb, treb_att
 *   q1–q32   (bridge variables from per-frame equations)
 *   rot, aspect, texsize, mesh_width, mesh_height
 */

// ──────────────────────────────────────────────────────────────────────
// 1. HLSL → GLSL token-level translation
// ──────────────────────────────────────────────────────────────────────

/** Common HLSL → GLSL type / function replacements. */
const HLSL_REPLACEMENTS: [RegExp, string][] = [
  // Types
  [/\bfloat2\b/g, 'vec2'],
  [/\bfloat3\b/g, 'vec3'],
  [/\bfloat4\b/g, 'vec4'],
  [/\bfloat2x2\b/g, 'mat2'],
  [/\bfloat3x3\b/g, 'mat3'],
  [/\bfloat4x4\b/g, 'mat4'],
  [/\bhalf\b/g, 'float'],
  [/\bhalf2\b/g, 'vec2'],
  [/\bhalf3\b/g, 'vec3'],
  [/\bhalf4\b/g, 'vec4'],
  [/\bint2\b/g, 'ivec2'],
  [/\bint3\b/g, 'ivec3'],
  [/\bint4\b/g, 'ivec4'],
  [/\bbool2\b/g, 'bvec2'],
  [/\bbool3\b/g, 'bvec3'],
  [/\bbool4\b/g, 'bvec4'],

  // Texture sampling
  // tex2D(sampler, uv) → texture(sampler, uv)
  [/\btex2D\s*\(/g, 'texture('],
  [/\btex3D\s*\(/g, 'texture('],

  // Functions
  [/\blerp\s*\(/g, 'mix('],
  [/\bsaturate\s*\(\s*/g, 'clamp('],  // saturate(x) → clamp(x, 0.0, 1.0) — handled below
  [/\bfrac\s*\(/g, 'fract('],
  [/\brsqrt\s*\(/g, 'inversesqrt('],
  [/\bddx\s*\(/g, 'dFdx('],
  [/\bddy\s*\(/g, 'dFdy('],
  [/\batan2\s*\(/g, 'atan('],

  // mul(matrix, vec) → matrix * vec
  [/\bmul\s*\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)/g, '($1 * $2)'],

  // Semantics (remove HLSL semantic annotations)
  [/\s*:\s*(?:SV_Target|COLOR|TEXCOORD\d*|POSITION|SV_Position)\b/gi, ''],

  // clip(x) → if (x < 0.0) discard;  — approximate
  [/\bclip\s*\(\s*([^)]+)\s*\)\s*;/g, 'if (($1) < 0.0) discard;'],

  // Static keyword (no equivalent in GLSL, just remove)
  [/\bstatic\s+/g, ''],
];

/**
 * Post-process: fix saturate() calls that were partially replaced.
 * `clamp(X` needs the `, 0.0, 1.0)` suffix.  We handle this with a
 * targeted regex that finds clamp( introduced by the saturate rule
 * and ensures it has two extra args.  Since the naive replacement
 * leaves `clamp(x)`, we match that pattern.
 */
function fixSaturate(code: string): string {
  // Find clamp(expr) with only one argument (no commas before the closing paren)
  // and convert to clamp(expr, 0.0, 1.0).
  return code.replace(/\bclamp\(([^,)]+)\)/g, 'clamp($1, 0.0, 1.0)');
}

/** Apply HLSL → GLSL token replacements. */
export function hlslToGlsl(hlsl: string): string {
  let glsl = hlsl;
  for (const [pattern, replacement] of HLSL_REPLACEMENTS) {
    glsl = glsl.replace(pattern, replacement);
  }
  glsl = fixSaturate(glsl);
  return glsl;
}

// ──────────────────────────────────────────────────────────────────────
// 2. MilkDrop uniform preamble
// ──────────────────────────────────────────────────────────────────────

/**
 * GLSL preamble mapping MilkDrop uniforms to NewAmp equivalents.
 *
 * MilkDrop shaders expect these as globals set by the host.  We map
 * the ones we can and stub the rest with reasonable defaults.
 */
export const MILKDROP_PREAMBLE = `
// ── MilkDrop compatibility shim ───────────────────────────────────────

// Time / frame
#define time iTime
#define fps (1.0 / max(iTimeDelta, 0.0001))
#define frame iFrame
float progress = 0.0;  // song progress 0–1 (not available in NewAmp yet)

// Audio energy (MilkDrop names → NewAmp uniforms)
#define bass iBass
#define mid iMid
#define treb iTreble
// _att variants are "attenuated" (smoothed) versions — we alias to the same
#define bass_att iBass
#define mid_att iMid
#define treb_att iTreble

// Viewport info
#define aspect (iResolution.x / iResolution.y)
#define texsize iResolution

// Q variables (q1–q32): bridge between per-frame equations and shaders.
// Without a full MilkDrop equation engine, we stub them at 0.
float q1=0.0, q2=0.0, q3=0.0, q4=0.0, q5=0.0, q6=0.0, q7=0.0, q8=0.0;
float q9=0.0,q10=0.0,q11=0.0,q12=0.0,q13=0.0,q14=0.0,q15=0.0,q16=0.0;
float q17=0.0,q18=0.0,q19=0.0,q20=0.0,q21=0.0,q22=0.0,q23=0.0,q24=0.0;
float q25=0.0,q26=0.0,q27=0.0,q28=0.0,q29=0.0,q30=0.0,q31=0.0,q32=0.0;

// Mesh info (stubs — we don't have MilkDrop's per-vertex mesh)
float mesh_width = 48.0;
float mesh_height = 36.0;

// MilkDrop's rot variable (cumulative rotation angle)
float rot = 0.0;

// Texture samplers used in MilkDrop shaders
#define sampler_main iBackbuffer
#define sampler_fw_main iBackbuffer
#define sampler_fc_main iBackbuffer
#define sampler_pw_main iBackbuffer
#define sampler_pc_main iBackbuffer
// Noise textures (stub to audio texture — not ideal but prevents compile errors)
#define sampler_noise_lq iChannel0
#define sampler_noise_mq iChannel0
#define sampler_noise_hq iChannel0
#define sampler_noisevol_lq iChannel0
#define sampler_noisevol_hq iChannel0
// Blur textures (stub to backbuffer)
#define sampler_blur1 iBackbuffer
#define sampler_blur2 iBackbuffer
#define sampler_blur3 iBackbuffer

// GetMain / GetPixel / GetBlur helpers used in some MilkDrop shaders
vec4 GetMain(vec2 uv) { return texture(iBackbuffer, uv); }
vec4 GetPixel(vec2 uv) { return texture(iBackbuffer, uv); }
vec4 GetBlur1(vec2 uv) { return texture(iBackbuffer, uv); }
vec4 GetBlur2(vec2 uv) { return texture(iBackbuffer, uv); }
vec4 GetBlur3(vec2 uv) { return texture(iBackbuffer, uv); }

// lum helper (used in many MilkDrop shaders for luminance)
float lum(vec3 c) { return dot(c, vec3(0.32, 0.49, 0.19)); }
float lum(vec4 c) { return dot(c.rgb, vec3(0.32, 0.49, 0.19)); }

`;

// ──────────────────────────────────────────────────────────────────────
// 3. Detection & wrapping
// ──────────────────────────────────────────────────────────────────────

/** Heuristic: does this look like MilkDrop HLSL shader code? */
export function isMilkDropCode(code: string): boolean {
  // Check for HLSL types or MilkDrop-specific identifiers
  const hlslSignals = [
    /\bfloat[234]\b/,           // HLSL types
    /\btex2D\s*\(/,             // HLSL texture sampling
    /\blerp\s*\(/,              // HLSL lerp
    /\bsampler_main\b/,         // MilkDrop sampler name
    /\bsampler_fw_main\b/,      // MilkDrop sampler name
    /\bGetMain\s*\(/,           // MilkDrop helper
    /\bGetPixel\s*\(/,          // MilkDrop helper
    /\bq[1-9]\b/,               // Q variables
    /\bbass_att\b/,             // MilkDrop audio uniform
    /\btreb\b/,                 // MilkDrop audio uniform
  ];

  let score = 0;
  for (const rx of hlslSignals) {
    if (rx.test(code)) score++;
  }
  // Need at least 2 signals to be reasonably confident
  return score >= 2;
}

/**
 * Convert a MilkDrop HLSL pixel shader to NewAmp-compatible GLSL.
 *
 * Steps:
 *   1. HLSL → GLSL token translation
 *   2. Prepend MilkDrop uniform preamble
 *   3. Wrap in a main() entry point if needed
 */
export function wrapMilkDropCode(hlslCode: string): string {
  let glsl = hlslToGlsl(hlslCode);

  // If the shader already has a main() or mainImage(), don't add one
  const hasMain = /void\s+main\s*\(/.test(glsl);
  const hasShaderBody = /\bshader_body\b/.test(hlslCode);

  // MilkDrop "shader_body" is the code block executed per-pixel.
  // It receives `uv` (texture coords) and writes to `ret` (output colour).
  if (hasShaderBody) {
    // Extract the shader_body content between { }
    const bodyMatch = glsl.match(/shader_body\s*\{([\s\S]*)\}/);
    if (bodyMatch) {
      const body = bodyMatch[1];
      glsl = glsl.replace(/shader_body\s*\{[\s\S]*\}/, '');
      glsl += `
void main() {
  vec2 uv = vUv;
  vec4 ret = vec4(0.0, 0.0, 0.0, 1.0);
  ${body}
  fragColor = ret;
}
`;
    }
  } else if (!hasMain) {
    // If there's a pixel_shader or shader function, try to call it
    const fnMatch = glsl.match(/vec4\s+(\w+)\s*\(\s*vec2\s+\w+\s*\)/);
    if (fnMatch) {
      glsl += `
void main() {
  fragColor = ${fnMatch[1]}(vUv);
}
`;
    } else {
      // Last resort: wrap everything as if it were shader_body content
      glsl += `
// Note: Could not detect entry point. Wrapping as shader_body.
void main() {
  vec2 uv = vUv;
  vec4 ret = vec4(0.0, 0.0, 0.0, 1.0);
  fragColor = ret;
}
`;
    }
  }

  return MILKDROP_PREAMBLE + glsl;
}

/**
 * Parse a .milk file and extract the warp/composite HLSL pixel shaders.
 *
 * .milk files are INI-like: key=value pairs, with multi-line shader code
 * stored after `[preset00]` section under keys like `warp_1` .. `warp_N`
 * and `comp_1` .. `comp_N`.
 */
export function parseMilkFile(milkText: string): {
  name: string;
  warpShader: string | null;
  compShader: string | null;
} {
  const lines = milkText.split('\n');
  const name = extractMilkValue(lines, 'PSVERSION') ? 'MilkDrop Preset' : 'MilkDrop Preset';

  const warpShader = extractMultilineShader(lines, 'warp_');
  const compShader = extractMultilineShader(lines, 'comp_');

  return { name, warpShader, compShader };
}

function extractMilkValue(lines: string[], key: string): string | null {
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith(key + '=')) {
      return trimmed.slice(key.length + 1).trim();
    }
  }
  return null;
}

function extractMultilineShader(lines: string[], prefix: string): string | null {
  const shaderLines: string[] = [];
  let found = false;

  for (const line of lines) {
    const trimmed = line.trim();
    // Match e.g. warp_1=`shader code here`
    const match = trimmed.match(new RegExp(`^${prefix}(\\d+)=(.*)$`));
    if (match) {
      found = true;
      shaderLines.push(match[2]);
    }
  }

  if (!found) return null;
  return shaderLines.join('\n').replace(/`/g, '');
}

/** Number of lines in MILKDROP_PREAMBLE (for error-line offset mapping). */
export const MILKDROP_PREAMBLE_LINES = MILKDROP_PREAMBLE.split('\n').length - 1;
