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

const BEAT_HISTORY = 64;

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

  // Beat detection state
  private energyHistory = new Float32Array(BEAT_HISTORY);
  private energyIdx = 0;
  private beat_ = 0;

  // BPM estimation state
  private beatTimes: number[] = [];
  private bpm_ = 0;

  constructor(analyser: AnalyserNode) {
    this.analyser = analyser;
    this.freqBuf = new Uint8Array(analyser.frequencyBinCount);
    this.timeBuf = new Uint8Array(analyser.frequencyBinCount);
  }

  getData(timeSeconds: number): AudioData {
    this.analyser.getByteFrequencyData(this.freqBuf);
    this.analyser.getByteTimeDomainData(this.timeBuf);

    const bass = bandEnergy(this.freqBuf, 0, 6);
    const mid = bandEnergy(this.freqBuf, 6, 93);
    const treble = bandEnergy(this.freqBuf, 93, 370);

    // Beat detection: rolling average + threshold
    const energy = (bass * 3 + mid + treble) / 5;
    this.energyHistory[this.energyIdx % BEAT_HISTORY] = energy;
    this.energyIdx++;

    let avgEnergy = 0;
    for (let i = 0; i < BEAT_HISTORY; i++) avgEnergy += this.energyHistory[i];
    avgEnergy /= BEAT_HISTORY;

    const threshold = avgEnergy * 1.4 + 0.005;
    const isBeat = energy > threshold;

    if (isBeat) {
      this.beat_ = Math.min(1, Math.max(0, (energy - avgEnergy) / (avgEnergy + 0.001)));
    } else {
      this.beat_ = Math.max(0, this.beat_ - 0.08);
    }

    // BPM estimation from beat intervals
    if (isBeat) {
      const last = this.beatTimes.length > 0 ? this.beatTimes[this.beatTimes.length - 1] : 0;
      if (timeSeconds - last > 0.2) {
        this.beatTimes.push(timeSeconds);
        while (this.beatTimes.length > 1 && timeSeconds - this.beatTimes[0] > 8) {
          this.beatTimes.shift();
        }
      }
    }

    if (this.beatTimes.length >= 4) {
      const span = this.beatTimes[this.beatTimes.length - 1] - this.beatTimes[0];
      const avgInterval = span / (this.beatTimes.length - 1);
      const bpm = avgInterval > 0 ? 60 / avgInterval : 0;
      this.bpm_ = (bpm >= 60 && bpm <= 200) ? bpm : 0;
    }

    // Spectral centroid (normalized 0-1)
    let weightedSum = 0;
    let totalMag = 0;
    const binCount = this.freqBuf.length;
    for (let i = 0; i < binCount; i++) {
      weightedSum += i * this.freqBuf[i];
      totalMag += this.freqBuf[i];
    }
    const spectralCentroid = totalMag > 0 ? (weightedSum / totalMag) / binCount : 0;

    return {
      frequencyData: this.freqBuf,
      timeDomainData: this.timeBuf,
      bass,
      mid,
      treble,
      beat: this.beat_,
      spectralCentroid,
      bpm: this.bpm_,
    };
  }
}

function bandEnergy(data: Uint8Array<ArrayBuffer>, lo: number, hi: number): number {
  let sum = 0;
  const end = Math.min(hi, data.length);
  for (let i = lo; i < end; i++) sum += data[i];
  return sum / ((end - lo) * 255);
}
