/**
 * AudioEngine handles decoding, playback, and transport controls.
 *
 * Web Audio API's AudioBufferSourceNode is single-use, so we recreate
 * it on each play/seek and track timing manually.
 */
export class AudioEngine {
  private ctx: AudioContext;
  private gainNode: GainNode;
  private _analyser: AnalyserNode;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private _playing = false;
  private startTime = 0;     // AudioContext.currentTime when playback started
  private startOffset = 0;   // offset into the buffer (seconds)

  /** Fires when playback reaches the end of the buffer. */
  onEnded: (() => void) | null = null;

  constructor() {
    this.ctx = new AudioContext();
    this._analyser = this.ctx.createAnalyser();
    this._analyser.fftSize = 1024; // → 512 frequency bins
    this._analyser.smoothingTimeConstant = 0.8;

    this.gainNode = this.ctx.createGain();
    this.gainNode.connect(this._analyser);
    this._analyser.connect(this.ctx.destination);

    this.setVolume(0.8);
  }

  get analyser(): AnalyserNode {
    return this._analyser;
  }

  get playing(): boolean {
    return this._playing;
  }

  get duration(): number {
    return this.buffer?.duration ?? 0;
  }

  get currentTime(): number {
    if (!this._playing) return this.startOffset;
    const t = this.ctx.currentTime - this.startTime + this.startOffset;
    return Math.min(t, this.duration);
  }

  async loadFile(file: File): Promise<void> {
    this.stop();
    const arrayBuffer = await file.arrayBuffer();
    this.buffer = await this.ctx.decodeAudioData(arrayBuffer);
    this.startOffset = 0;
  }

  play(): void {
    if (!this.buffer || this._playing) return;
    if (this.startOffset >= this.duration) this.startOffset = 0;

    this.ctx.resume();

    this.source = this.ctx.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.connect(this.gainNode);
    this.source.onended = () => {
      if (this._playing) {
        this._playing = false;
        this.startOffset = 0;
        this.source?.disconnect();
        this.source = null;
        this.onEnded?.();
      }
    };

    this.startTime = this.ctx.currentTime;
    this.source.start(0, this.startOffset);
    this._playing = true;
  }

  pause(): void {
    if (!this._playing) return;
    this.startOffset = this.currentTime;
    this.source?.stop();
    this.source?.disconnect();
    this.source = null;
    this._playing = false;
  }

  stop(): void {
    if (this._playing) {
      this.source?.stop();
      this.source?.disconnect();
      this.source = null;
      this._playing = false;
    }
    this.startOffset = 0;
  }

  seek(time: number): void {
    const wasPlaying = this._playing;
    if (wasPlaying) {
      this.source?.stop();
      this.source?.disconnect();
      this.source = null;
      this._playing = false;
    }
    this.startOffset = Math.max(0, Math.min(time, this.duration));
    if (wasPlaying) this.play();
  }

  setVolume(value: number): void {
    this.gainNode.gain.value = Math.max(0, Math.min(1, value));
  }
}
