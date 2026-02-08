use rustfft::{num_complex::Complex, FftPlanner};
use wasm_bindgen::prelude::*;

/// FFT size used throughout (must be power of 2).
const FFT_SIZE: usize = 1024;
const HALF: usize = FFT_SIZE / 2; // 512 frequency bins

/// Number of energy history frames kept for beat detection.
const BEAT_HISTORY: usize = 64;

/// Hanning window, pre-computed once.
static mut WINDOW: [f32; FFT_SIZE] = [0.0; FFT_SIZE];

/// Persistent state for the DSP pipeline, exported to JS via wasm-bindgen.
#[wasm_bindgen]
pub struct DspPipeline {
    // FFT
    fft_buf: Vec<Complex<f32>>,
    scratch: Vec<Complex<f32>>,
    planner_fft: std::sync::Arc<dyn rustfft::Fft<f32>>,

    // Output arrays (kept alive so JS can read via pointer)
    magnitude: Vec<f32>,   // HALF floats – linear magnitude
    mag_bytes: Vec<u8>,    // HALF bytes – magnitude scaled to 0–255
    waveform: Vec<u8>,     // HALF bytes – time-domain scaled to 0–255

    // Band energies
    bass: f32,
    mid: f32,
    treble: f32,

    // Beat detection
    energy_history: Vec<f32>,
    energy_idx: usize,
    beat: f32,

    // Spectral centroid (normalised 0–1)
    spectral_centroid: f32,

    // Simple BPM estimation
    beat_times: Vec<f64>,  // timestamps (seconds) of detected beats
    bpm: f32,
}

#[wasm_bindgen]
impl DspPipeline {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        // Pre-compute Hanning window
        unsafe {
            for i in 0..FFT_SIZE {
                let t = std::f32::consts::PI * 2.0 * i as f32 / FFT_SIZE as f32;
                WINDOW[i] = 0.5 * (1.0 - t.cos());
            }
        }

        let mut planner = FftPlanner::new();
        let fft = planner.plan_fft_forward(FFT_SIZE);
        let scratch_len = fft.get_inplace_scratch_len();

        Self {
            fft_buf: vec![Complex::new(0.0, 0.0); FFT_SIZE],
            scratch: vec![Complex::new(0.0, 0.0); scratch_len],
            planner_fft: fft,
            magnitude: vec![0.0; HALF],
            mag_bytes: vec![0; HALF],
            waveform: vec![128; HALF],
            bass: 0.0,
            mid: 0.0,
            treble: 0.0,
            energy_history: vec![0.0; BEAT_HISTORY],
            energy_idx: 0,
            beat: 0.0,
            spectral_centroid: 0.0,
            beat_times: Vec::with_capacity(32),
            bpm: 0.0,
        }
    }

    /// Process a frame of raw PCM samples (f32, mono, FFT_SIZE samples).
    /// `time_seconds` is the current playback time (for BPM tracking).
    #[wasm_bindgen]
    pub fn process(&mut self, samples: &[f32], time_seconds: f64) {
        let len = samples.len().min(FFT_SIZE);

        // ── Waveform output (downsample to HALF bytes) ──
        for i in 0..HALF {
            let s = if i * 2 < len { samples[i * 2] } else { 0.0 };
            self.waveform[i] = ((s * 0.5 + 0.5) * 255.0).clamp(0.0, 255.0) as u8;
        }

        // ── Apply Hanning window → FFT buffer ──
        unsafe {
            for i in 0..FFT_SIZE {
                let s = if i < len { samples[i] } else { 0.0 };
                self.fft_buf[i] = Complex::new(s * WINDOW[i], 0.0);
            }
        }

        // ── Forward FFT (in-place) ──
        self.planner_fft
            .process_with_scratch(&mut self.fft_buf, &mut self.scratch);

        // ── Compute magnitude spectrum ──
        let norm = 1.0 / FFT_SIZE as f32;
        for i in 0..HALF {
            self.magnitude[i] = self.fft_buf[i].norm() * norm;
        }

        // ── Scale to bytes (log scale, roughly matching AnalyserNode behaviour) ──
        for i in 0..HALF {
            // Convert to dB, clamp to [-100, -10] range, map to 0–255
            let db = 20.0 * (self.magnitude[i] + 1e-20).log10();
            let clamped = ((db + 100.0) / 90.0).clamp(0.0, 1.0);
            self.mag_bytes[i] = (clamped * 255.0) as u8;
        }

        // ── Band energies ──
        // Each bin ≈ sampleRate / FFT_SIZE ≈ 44100/1024 ≈ 43 Hz
        // Bass: 0–260 Hz → bins 0–5
        // Mid:  260–4000 Hz → bins 6–92
        // Treble: 4000–16000 Hz → bins 93–370
        self.bass = band_energy(&self.magnitude, 0, 6);
        self.mid = band_energy(&self.magnitude, 6, 93);
        self.treble = band_energy(&self.magnitude, 93, 370);

        // ── Spectral centroid (normalised) ──
        let mut weighted_sum = 0.0f32;
        let mut total_mag = 0.0f32;
        for i in 0..HALF {
            weighted_sum += i as f32 * self.magnitude[i];
            total_mag += self.magnitude[i];
        }
        self.spectral_centroid = if total_mag > 1e-10 {
            (weighted_sum / total_mag) / HALF as f32
        } else {
            0.0
        };

        // ── Beat detection ──
        let energy = (self.bass * 3.0 + self.mid + self.treble) / 5.0;

        // Rolling average of recent energy
        self.energy_history[self.energy_idx % BEAT_HISTORY] = energy;
        self.energy_idx += 1;

        let avg_energy: f32 =
            self.energy_history.iter().sum::<f32>() / BEAT_HISTORY as f32;

        let threshold = avg_energy * 1.4 + 0.005;
        let is_beat = energy > threshold;

        self.beat = if is_beat {
            ((energy - avg_energy) / (avg_energy + 0.001)).clamp(0.0, 1.0)
        } else {
            // Decay
            (self.beat - 0.08).max(0.0)
        };

        // ── BPM estimation ──
        if is_beat {
            // Only record if enough time since last beat (debounce: >200ms)
            let last = self.beat_times.last().copied().unwrap_or(0.0);
            if time_seconds - last > 0.2 {
                self.beat_times.push(time_seconds);
                // Keep only recent beats (last ~8 seconds)
                while self.beat_times.len() > 1
                    && time_seconds - self.beat_times[0] > 8.0
                {
                    self.beat_times.remove(0);
                }
            }
        }

        if self.beat_times.len() >= 4 {
            let span = self.beat_times.last().unwrap() - self.beat_times[0];
            let intervals = (self.beat_times.len() - 1) as f64;
            let avg_interval = span / intervals;
            if avg_interval > 0.0 {
                self.bpm = (60.0 / avg_interval) as f32;
                // Clamp to reasonable BPM range
                if self.bpm < 60.0 || self.bpm > 200.0 {
                    self.bpm = 0.0;
                }
            }
        }
    }

    // ── Accessors for JS ──

    #[wasm_bindgen(getter)]
    pub fn bass(&self) -> f32 {
        self.bass
    }

    #[wasm_bindgen(getter)]
    pub fn mid(&self) -> f32 {
        self.mid
    }

    #[wasm_bindgen(getter)]
    pub fn treble(&self) -> f32 {
        self.treble
    }

    #[wasm_bindgen(getter)]
    pub fn beat(&self) -> f32 {
        self.beat
    }

    #[wasm_bindgen(getter)]
    pub fn spectral_centroid(&self) -> f32 {
        self.spectral_centroid
    }

    #[wasm_bindgen(getter)]
    pub fn bpm(&self) -> f32 {
        self.bpm
    }

    /// Pointer to the 512-byte magnitude array (for texture upload).
    #[wasm_bindgen(getter)]
    pub fn mag_ptr(&self) -> *const u8 {
        self.mag_bytes.as_ptr()
    }

    /// Pointer to the 512-byte waveform array (for texture upload).
    #[wasm_bindgen(getter)]
    pub fn wave_ptr(&self) -> *const u8 {
        self.waveform.as_ptr()
    }

    #[wasm_bindgen(getter)]
    pub fn bin_count(&self) -> usize {
        HALF
    }
}

/// Average linear magnitude in a frequency band.
fn band_energy(mag: &[f32], lo: usize, hi: usize) -> f32 {
    let end = hi.min(mag.len());
    if end <= lo {
        return 0.0;
    }
    let sum: f32 = mag[lo..end].iter().sum();
    // Normalise: typical magnitude values are small, scale up for 0–1 range
    (sum / (end - lo) as f32 * 40.0).clamp(0.0, 1.0)
}
