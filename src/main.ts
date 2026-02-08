import { AudioEngine } from './audio/engine';
import { Analyzer, AudioData } from './audio/analyzer';
import { Renderer } from './renderer/webgl';
import { presets } from './renderer/shaders';

/* ── DOM refs ── */
const canvas        = document.getElementById('viz-canvas')  as HTMLCanvasElement;
const dropOverlay   = document.getElementById('drop-overlay') as HTMLDivElement;
const fileInput     = document.getElementById('file-input')   as HTMLInputElement;
const playBtn       = document.getElementById('play-btn')     as HTMLButtonElement;
const stopBtn       = document.getElementById('stop-btn')     as HTMLButtonElement;
const seekBar       = document.getElementById('seek-bar')     as HTMLInputElement;
const timeCurrent   = document.getElementById('time-current') as HTMLSpanElement;
const timeTotal     = document.getElementById('time-total')   as HTMLSpanElement;
const volumeInput   = document.getElementById('volume')       as HTMLInputElement;
const presetSelect  = document.getElementById('preset-select') as HTMLSelectElement;
const fullscreenBtn = document.getElementById('fullscreen-btn') as HTMLButtonElement;
const trackName     = document.getElementById('track-name')   as HTMLDivElement;

/* ── Core objects ── */
const audio    = new AudioEngine();
const analyzer = new Analyzer(audio.analyser);
const renderer = new Renderer(canvas);

/* ── Preset population ── */
presets.forEach((p, i) => {
  const opt = document.createElement('option');
  opt.value = String(i);
  opt.textContent = p.name;
  presetSelect.appendChild(opt);
});

let currentPreset = 0;
applyPreset(currentPreset);

function applyPreset(index: number) {
  const result = renderer.setShader(presets[index].fragmentShader);
  if (!result.success) {
    console.error(`Shader error in "${presets[index].name}":`, result.error);
  }
}

/* ── File loading ── */
async function loadFile(file: File) {
  trackName.textContent = file.name;
  try {
    await audio.loadFile(file);
    playBtn.disabled = false;
    stopBtn.disabled = false;
    timeTotal.textContent = formatTime(audio.duration);
    audio.play();
    updatePlayButton();
  } catch (e) {
    trackName.textContent = `Error: ${(e as Error).message}`;
  }
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) loadFile(file);
});

/* ── Drag-and-drop ── */
let dragCounter = 0;

document.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragCounter++;
  dropOverlay.classList.remove('hidden');
});

document.addEventListener('dragleave', () => {
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    dropOverlay.classList.add('hidden');
  }
});

document.addEventListener('dragover', (e) => e.preventDefault());

document.addEventListener('drop', (e) => {
  e.preventDefault();
  dragCounter = 0;
  dropOverlay.classList.add('hidden');
  const file = e.dataTransfer?.files[0];
  if (file && file.type.startsWith('audio/')) loadFile(file);
});

/* ── Transport controls ── */
playBtn.addEventListener('click', () => {
  if (audio.playing) audio.pause();
  else audio.play();
  updatePlayButton();
});

stopBtn.addEventListener('click', () => {
  audio.stop();
  updatePlayButton();
});

audio.onEnded = () => updatePlayButton();

function updatePlayButton() {
  playBtn.textContent = audio.playing ? '\u23F8' : '\u25B6';
}

/* ── Seek bar ── */
let seeking = false;

seekBar.addEventListener('pointerdown', () => { seeking = true; });
seekBar.addEventListener('pointerup', () => {
  seeking = false;
  if (audio.duration > 0) {
    audio.seek((Number(seekBar.value) / 1000) * audio.duration);
  }
});
seekBar.addEventListener('input', () => {
  if (seeking && audio.duration > 0) {
    timeCurrent.textContent = formatTime((Number(seekBar.value) / 1000) * audio.duration);
  }
});

/* ── Volume ── */
volumeInput.addEventListener('input', () => {
  audio.setVolume(Number(volumeInput.value) / 100);
});

/* ── Preset selector ── */
presetSelect.addEventListener('change', () => {
  currentPreset = Number(presetSelect.value);
  applyPreset(currentPreset);
});

/* ── Fullscreen ── */
fullscreenBtn.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
});

/* ── Keyboard shortcuts ── */
document.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  switch (e.key) {
    case ' ':
      e.preventDefault();
      if (audio.playing) audio.pause(); else audio.play();
      updatePlayButton();
      break;
    case 'ArrowLeft':
      audio.seek(audio.currentTime - 5);
      break;
    case 'ArrowRight':
      audio.seek(audio.currentTime + 5);
      break;
    case 'f':
    case 'F':
      fullscreenBtn.click();
      break;
  }
});

/* ── Animation loop ── */
let lastTime = 0;

// Silence data when nothing is playing / loaded
const silentData: AudioData = {
  frequencyData: new Uint8Array(512),
  timeDomainData: new Uint8Array(512).fill(128),
  bass: 0, mid: 0, treble: 0, beat: 0,
};

function frame(now: number) {
  // Resize canvas to match CSS size × devicePixelRatio
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(canvas.clientWidth * dpr);
  const h = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }

  const dt = (now - lastTime) / 1000;
  lastTime = now;

  const audioData = audio.playing ? analyzer.getData() : silentData;
  renderer.render(now / 1000, dt, audioData);

  // Update time display (unless user is dragging the seek bar)
  if (!seeking && audio.duration > 0) {
    timeCurrent.textContent = formatTime(audio.currentTime);
    seekBar.value = String((audio.currentTime / audio.duration) * 1000);
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

/* ── Helpers ── */
function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
