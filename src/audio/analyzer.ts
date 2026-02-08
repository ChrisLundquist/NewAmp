export interface AudioData {
  /** 512 bytes of FFT magnitude (0-255). */
  frequencyData: Uint8Array<ArrayBuffer>;
  /** 512 bytes of waveform (128 = silence center). */
  timeDomainData: Uint8Array<ArrayBuffer>;
  /** Normalized energy in 20-250 Hz band (0-1). */
  bass: number;
  /** Normalized energy in 250-4000 Hz band (0-1). */
  mid: number;
  /** Normalized energy in 4000-16000 Hz band (0-1). */
  treble: number;
  /** Beat intensity — spikes on energy transients (0-1). */
  beat: number;
  /** Spectral centroid, normalized 0-1 (brightness of sound). */
  spectralCentroid: number;
  /** Estimated BPM, 0 if unknown. */
  bpm: number;
}

/**
 * Wraps an AnalyserNode and extracts per-frame audio features.
 *
 * Frequency bins at fftSize=1024 / sampleRate=44100:
 *   each bin ≈ 43 Hz, 512 bins total (0 – 22050 Hz)
 *
 *   bass    bins 0-5     ≈ 0-260 Hz
 *   mid     bins 6-92    ≈ 260-4000 Hz
 *   treble  bins 93-370  ≈ 4000-16000 Hz
 */
export class Analyzer {
  private analyser: AnalyserNode;
  private freqBuf: Uint8Array<ArrayBuffer>;
  private timeBuf: Uint8Array<ArrayBuffer>;
  private prevEnergy = 0;

  constructor(analyser: AnalyserNode) {
    this.analyser = analyser;
    // frequencyBinCount = fftSize/2 = 512
    this.freqBuf = new Uint8Array(analyser.frequencyBinCount);
    // We only need 512 of the 1024 time-domain samples
    this.timeBuf = new Uint8Array(analyser.frequencyBinCount);
  }

  getData(): AudioData {
    this.analyser.getByteFrequencyData(this.freqBuf);
    this.analyser.getByteTimeDomainData(this.timeBuf);

    const bass = bandEnergy(this.freqBuf, 0, 6);
    const mid = bandEnergy(this.freqBuf, 6, 93);
    const treble = bandEnergy(this.freqBuf, 93, 370);

    // Simple onset detection: spike in total energy vs smoothed average
    const energy = (bass + mid + treble) / 3;
    const delta = energy - this.prevEnergy;
    const beat = Math.max(0, Math.min(1, delta * 6));
    this.prevEnergy += (energy - this.prevEnergy) * 0.12;

    return {
      frequencyData: this.freqBuf,
      timeDomainData: this.timeBuf,
      bass,
      mid,
      treble,
      beat,
      spectralCentroid: 0,
      bpm: 0,
    };
  }
}

function bandEnergy(data: Uint8Array<ArrayBuffer>, lo: number, hi: number): number {
  let sum = 0;
  const end = Math.min(hi, data.length);
  for (let i = lo; i < end; i++) sum += data[i];
  return sum / ((end - lo) * 255);
}
