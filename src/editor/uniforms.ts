import type { AudioData } from '../audio/analyzer';

/** Describes a single shader uniform for documentation and live inspection. */
export interface UniformInfo {
  name: string;
  type: string;
  description: string;
  range?: string;
  /** Return current live value as a display string, or null if not available. */
  liveValue: (ctx: LiveContext) => string;
}

export interface LiveContext {
  audio: AudioData;
  time: number;
  timeDelta: number;
  resolution: [number, number];
  frame: number;
}

/** All uniforms available in the NewAmp shader API. */
export const UNIFORM_CATALOG: UniformInfo[] = [
  {
    name: 'iTime',
    type: 'float',
    description: 'Playback time in seconds since the page loaded.',
    liveValue: (ctx) => ctx.time.toFixed(3) + 's',
  },
  {
    name: 'iTimeDelta',
    type: 'float',
    description: 'Time elapsed since the previous frame, in seconds.',
    liveValue: (ctx) => ctx.timeDelta.toFixed(4) + 's (' + Math.round(1 / Math.max(ctx.timeDelta, 0.001)) + ' fps)',
  },
  {
    name: 'iResolution',
    type: 'vec2',
    description: 'Viewport resolution in pixels (width, height). Affected by render scale.',
    liveValue: (ctx) => `${ctx.resolution[0]} × ${ctx.resolution[1]} px`,
  },
  {
    name: 'iChannel0',
    type: 'sampler2D',
    description:
      'Audio data texture (512×2).\n' +
      '  Row 0 (sample at y≈0.25): FFT frequency spectrum, 512 bins.\n' +
      '  Row 1 (sample at y≈0.75): Raw PCM waveform, 512 samples.\n' +
      'Values are in the 0.0–1.0 range. Sample with texture(iChannel0, vec2(x, 0.25)).r',
    liveValue: (ctx) => {
      let peak = 0;
      const fd = ctx.audio.frequencyData;
      for (let i = 0; i < 32 && i < fd.length; i++) {
        if (fd[i] > peak) peak = fd[i];
      }
      return `peak low-freq bin: ${peak}/255`;
    },
  },
  {
    name: 'iBackbuffer',
    type: 'sampler2D',
    description:
      'Previous frame output. Use for feedback effects like trails, motion blur,\n' +
      'warp, and kaleidoscope. Sample: texture(iBackbuffer, uv).rgb',
    liveValue: () => '(texture)',
  },
  {
    name: 'iBass',
    type: 'float',
    description: 'Normalized energy in the bass band (20–260 Hz).',
    range: '0.0 – 1.0',
    liveValue: (ctx) => ctx.audio.bass.toFixed(3),
  },
  {
    name: 'iMid',
    type: 'float',
    description: 'Normalized energy in the mid band (260–4000 Hz).',
    range: '0.0 – 1.0',
    liveValue: (ctx) => ctx.audio.mid.toFixed(3),
  },
  {
    name: 'iTreble',
    type: 'float',
    description: 'Normalized energy in the treble band (4000–16000 Hz).',
    range: '0.0 – 1.0',
    liveValue: (ctx) => ctx.audio.treble.toFixed(3),
  },
  {
    name: 'iBeat',
    type: 'float',
    description: 'Beat intensity. Spikes on energy transients, decays between beats.',
    range: '0.0 – 1.0',
    liveValue: (ctx) => ctx.audio.beat.toFixed(3),
  },
  {
    name: 'iSpectralCentroid',
    type: 'float',
    description: 'Spectral centroid (perceived brightness of sound). Low = bassy, high = bright/tinny.',
    range: '0.0 – 1.0',
    liveValue: (ctx) => ctx.audio.spectralCentroid.toFixed(3),
  },
  {
    name: 'iBPM',
    type: 'float',
    description: 'Estimated beats per minute. 0 if not enough beats detected yet.',
    range: '60 – 200 (or 0)',
    liveValue: (ctx) => ctx.audio.bpm > 0 ? Math.round(ctx.audio.bpm) + ' BPM' : 'detecting...',
  },
  {
    name: 'iFrame',
    type: 'float',
    description: 'Frame counter (increments by 1 each frame since page load).',
    liveValue: (ctx) => String(ctx.frame),
  },
  {
    name: 'vUv',
    type: 'vec2',
    description: 'Fragment UV coordinates. (0,0) = bottom-left, (1,1) = top-right.',
    range: '0.0 – 1.0 per component',
    liveValue: () => '(varies per pixel)',
  },
  {
    name: 'fragColor',
    type: 'vec4 (out)',
    description: 'Output colour for this fragment. Set this in main(): fragColor = vec4(r, g, b, 1.0);',
    liveValue: () => '(output)',
  },
];

/** Lookup uniform info by name. */
export const UNIFORM_MAP = new Map(UNIFORM_CATALOG.map((u) => [u.name, u]));
