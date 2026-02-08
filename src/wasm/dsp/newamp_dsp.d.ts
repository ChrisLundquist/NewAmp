/* tslint:disable */
/* eslint-disable */

/**
 * Persistent state for the DSP pipeline, exported to JS via wasm-bindgen.
 */
export class DspPipeline {
    free(): void;
    [Symbol.dispose](): void;
    constructor();
    /**
     * Process a frame of raw PCM samples (f32, mono, FFT_SIZE samples).
     * `time_seconds` is the current playback time (for BPM tracking).
     */
    process(samples: Float32Array, time_seconds: number): void;
    readonly bass: number;
    readonly beat: number;
    readonly bin_count: number;
    readonly bpm: number;
    /**
     * Pointer to the 512-byte magnitude array (for texture upload).
     */
    readonly mag_ptr: number;
    readonly mid: number;
    readonly spectral_centroid: number;
    readonly treble: number;
    /**
     * Pointer to the 512-byte waveform array (for texture upload).
     */
    readonly wave_ptr: number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_dsppipeline_free: (a: number, b: number) => void;
    readonly dsppipeline_bass: (a: number) => number;
    readonly dsppipeline_beat: (a: number) => number;
    readonly dsppipeline_bin_count: (a: number) => number;
    readonly dsppipeline_bpm: (a: number) => number;
    readonly dsppipeline_mag_ptr: (a: number) => number;
    readonly dsppipeline_mid: (a: number) => number;
    readonly dsppipeline_new: () => number;
    readonly dsppipeline_process: (a: number, b: number, c: number, d: number) => void;
    readonly dsppipeline_spectral_centroid: (a: number) => number;
    readonly dsppipeline_treble: (a: number) => number;
    readonly dsppipeline_wave_ptr: (a: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
