import type { AudioData } from './analyzer';
import init, { DspPipeline } from '../wasm/dsp/newamp_dsp';
import wasmUrl from '../wasm/dsp/newamp_dsp_bg.wasm?url';

/**
 * High-quality analyzer using Rust/WASM FFT pipeline.
 *
 * Reads raw float32 samples from the AnalyserNode's time-domain output,
 * feeds them to the WASM DspPipeline which performs:
 *   - Hanning-windowed FFT (1024-point)
 *   - Log-scaled magnitude spectrum
 *   - Band energy (bass / mid / treble)
 *   - Beat detection with BPM estimation
 *   - Spectral centroid
 *
 * Falls back to the plain Analyzer if WASM fails to load.
 */
export class WasmAnalyzer {
  private analyser: AnalyserNode;
  private pipeline: DspPipeline;
  private wasmMemory: WebAssembly.Memory;
  private floatBuf: Float32Array<ArrayBuffer>;

  // Reusable output arrays
  private freqOut: Uint8Array<ArrayBuffer>;
  private waveOut: Uint8Array<ArrayBuffer>;

  private constructor(
    analyser: AnalyserNode,
    pipeline: DspPipeline,
    memory: WebAssembly.Memory,
  ) {
    this.analyser = analyser;
    this.pipeline = pipeline;
    this.wasmMemory = memory;
    this.floatBuf = new Float32Array(analyser.fftSize); // 1024
    this.freqOut = new Uint8Array(512);
    this.waveOut = new Uint8Array(512);
  }

  /**
   * Async factory — initialises the WASM module.
   * Returns null if WASM fails to load.
   */
  static async create(analyser: AnalyserNode): Promise<WasmAnalyzer | null> {
    try {
      const instance = await init(wasmUrl);
      const pipeline = new DspPipeline();
      return new WasmAnalyzer(analyser, pipeline, instance.memory);
    } catch (e) {
      console.warn('WASM DSP failed to load, falling back to AnalyserNode:', e);
      return null;
    }
  }

  getData(timeSeconds: number): AudioData {
    // Get raw float32 time-domain samples from AnalyserNode
    this.analyser.getFloatTimeDomainData(this.floatBuf);

    // Run WASM DSP pipeline
    this.pipeline.process(this.floatBuf, timeSeconds);

    // Read output arrays from WASM memory
    const magPtr = this.pipeline.mag_ptr;
    const wavePtr = this.pipeline.wave_ptr;
    const binCount = this.pipeline.bin_count; // 512

    // Create views into WASM memory and copy to our output arrays
    const wasmBytes = new Uint8Array(this.wasmMemory.buffer);
    this.freqOut.set(wasmBytes.subarray(magPtr, magPtr + binCount));
    this.waveOut.set(wasmBytes.subarray(wavePtr, wavePtr + binCount));

    return {
      frequencyData: this.freqOut,
      timeDomainData: this.waveOut,
      bass: this.pipeline.bass,
      mid: this.pipeline.mid,
      treble: this.pipeline.treble,
      beat: this.pipeline.beat,
      spectralCentroid: this.pipeline.spectral_centroid,
      bpm: this.pipeline.bpm,
    };
  }
}
