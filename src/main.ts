import { AudioEngine } from './audio/engine';
import { Analyzer, AudioData } from './audio/analyzer';
import { WasmAnalyzer } from './audio/wasm-analyzer';
import { Renderer } from './renderer/webgl';
import { ShaderEditor } from './editor/editor';
import { PresetManager } from './editor/preset-manager';
import { UniformInspector } from './editor/inspector';
import type { LiveContext } from './editor/uniforms';

/* ── DOM refs ── */
const canvas          = document.getElementById('viz-canvas')      as HTMLCanvasElement;
const dropOverlay     = document.getElementById('drop-overlay')    as HTMLDivElement;
const fileInput       = document.getElementById('file-input')      as HTMLInputElement;
const playBtn         = document.getElementById('play-btn')        as HTMLButtonElement;
const stopBtn         = document.getElementById('stop-btn')        as HTMLButtonElement;
const seekBar         = document.getElementById('seek-bar')        as HTMLInputElement;
const timeCurrent     = document.getElementById('time-current')    as HTMLSpanElement;
const timeTotal       = document.getElementById('time-total')      as HTMLSpanElement;
const volumeInput     = document.getElementById('volume')          as HTMLInputElement;
const presetSelect    = document.getElementById('preset-select')   as HTMLSelectElement;
const fullscreenBtn   = document.getElementById('fullscreen-btn')  as HTMLButtonElement;
const trackName       = document.getElementById('track-name')      as HTMLDivElement;
const editorToggleBtn = document.getElementById('editor-toggle')   as HTMLButtonElement;
const editorPanel     = document.getElementById('editor-panel')    as HTMLDivElement;
const editorCloseBtn  = document.getElementById('editor-close')    as HTMLButtonElement;
const shaderNameInput = document.getElementById('shader-name')     as HTMLInputElement;
const newPresetBtn    = document.getElementById('new-preset')      as HTMLButtonElement;
const savePresetBtn   = document.getElementById('save-preset')     as HTMLButtonElement;
const deletePresetBtn = document.getElementById('delete-preset')   as HTMLButtonElement;
const exportPresetBtn = document.getElementById('export-preset')   as HTMLButtonElement;
const importPresetIn  = document.getElementById('import-preset')   as HTMLInputElement;
const shaderErrorsEl  = document.getElementById('shader-errors')   as HTMLDivElement;
const monacoContainer = document.getElementById('monaco-container') as HTMLDivElement;
const inspectorEl     = document.getElementById('uniform-inspector') as HTMLDivElement;
const renderScaleSlider = document.getElementById('render-scale')  as HTMLInputElement | null;
const renderScaleLabel  = document.getElementById('render-scale-value') as HTMLSpanElement | null;

/* ── Core objects ── */
const audio          = new AudioEngine();
const fallbackAnalyzer = new Analyzer(audio.analyser);
const renderer       = new Renderer(canvas);
const presetManager  = new PresetManager();
const shaderEditor   = new ShaderEditor(monacoContainer);
const inspector      = new UniformInspector(inspectorEl);

/* ── State ── */
let currentPresetKey = 'builtin:0';
let editorOpen = false;
let wasmAnalyzer: WasmAnalyzer | null = null;

// Try to initialise WASM analyzer (async, falls back gracefully)
WasmAnalyzer.create(audio.analyser).then((wa) => {
  wasmAnalyzer = wa;
  if (wa) console.log('WASM DSP pipeline active');
  else console.log('Using AnalyserNode fallback');
});

/* ── Render scale ── */
if (renderScaleSlider) {
  renderScaleSlider.addEventListener('input', () => {
    const v = Number(renderScaleSlider.value) / 100;
    renderer.renderScale = v;
    if (renderScaleLabel) renderScaleLabel.textContent = Math.round(v * 100) + '%';
  });
}

/* ── Preset selector ── */
function rebuildPresetSelect(selectKey?: string) {
  presetSelect.innerHTML = '';
  const { builtin, user } = presetManager.getAll();

  const builtinGroup = document.createElement('optgroup');
  builtinGroup.label = 'Built-in';
  builtin.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = `builtin:${i}`;
    opt.textContent = p.name;
    builtinGroup.appendChild(opt);
  });
  presetSelect.appendChild(builtinGroup);

  if (user.length > 0) {
    const userGroup = document.createElement('optgroup');
    userGroup.label = 'My Presets';
    user.forEach((p, i) => {
      const opt = document.createElement('option');
      opt.value = `user:${i}`;
      opt.textContent = p.name;
      userGroup.appendChild(opt);
    });
    presetSelect.appendChild(userGroup);
  }

  if (selectKey) {
    presetSelect.value = selectKey;
    currentPresetKey = selectKey;
  }
}

rebuildPresetSelect('builtin:0');

function applyPresetByKey(key: string) {
  const preset = presetManager.getByKey(key);
  if (!preset) return;

  currentPresetKey = key;
  presetSelect.value = key;
  const result = renderer.setShader(preset.fragmentShader);

  if (editorOpen) {
    shaderEditor.setValue(preset.fragmentShader);
    shaderNameInput.value = preset.name;
    updateDeleteButton();
  }

  if (!result.success) {
    console.error(`Shader error in "${preset.name}":`, result.error);
    showShaderErrors(result.error ?? '');
  } else {
    clearShaderErrors();
    shaderEditor.clearErrors();
  }
}

applyPresetByKey('builtin:0');

/* ── Editor toggle ── */
function toggleEditor(open?: boolean) {
  editorOpen = open ?? !editorOpen;

  if (editorOpen) {
    editorPanel.classList.remove('hidden');
    document.body.classList.add('editor-open');
    // Sync editor content with current preset
    const preset = presetManager.getByKey(currentPresetKey);
    if (preset) {
      shaderEditor.setValue(preset.fragmentShader);
      shaderNameInput.value = preset.name;
    }
    updateDeleteButton();
    // Give Monaco a moment to layout then focus
    requestAnimationFrame(() => shaderEditor.layout());
  } else {
    editorPanel.classList.add('hidden');
    document.body.classList.remove('editor-open');
  }
}

editorToggleBtn.addEventListener('click', () => toggleEditor());
editorCloseBtn.addEventListener('click', () => toggleEditor(false));

/* ── Live shader compilation ── */
shaderEditor.onChange = (code: string) => {
  const result = renderer.setShader(code);
  if (result.success) {
    clearShaderErrors();
    shaderEditor.clearErrors();
  } else {
    showShaderErrors(result.error ?? '');
  }
};

function showShaderErrors(rawLog: string) {
  const parsed = shaderEditor.setErrors(rawLog);
  shaderErrorsEl.innerHTML = '';

  for (const err of parsed) {
    const div = document.createElement('div');
    div.className = 'error-line';
    div.dataset.line = String(err.line);

    const lineSpan = document.createElement('span');
    lineSpan.className = 'error-line-num';
    lineSpan.textContent = `L${err.line}`;

    const msgSpan = document.createElement('span');
    msgSpan.className = 'error-msg';
    msgSpan.textContent = err.message;

    if (err.severity === 'warning') {
      div.classList.add('warning');
    }

    div.append(lineSpan, msgSpan);
    div.addEventListener('click', () => {
      shaderEditor.goToLine(err.line);
    });
    shaderErrorsEl.appendChild(div);
  }
}

function clearShaderErrors() {
  shaderErrorsEl.innerHTML = '';
}

/* ── Preset save / new / delete ── */
const STARTER_SHADER = `void main() {
  vec2 uv = vUv;
  float freq = texture(iChannel0, vec2(uv.x, 0.25)).r;
  vec3 col = vec3(freq * uv.x, freq * uv.y, freq);
  fragColor = vec4(col, 1.0);
}
`;

newPresetBtn.addEventListener('click', () => {
  const key = presetManager.saveNew('Untitled', STARTER_SHADER);
  rebuildPresetSelect(key);
  applyPresetByKey(key);
  if (!editorOpen) toggleEditor(true);
  shaderNameInput.select();
});

savePresetBtn.addEventListener('click', () => {
  const code = shaderEditor.getValue();
  const name = shaderNameInput.value.trim() || 'Untitled';

  if (currentPresetKey.startsWith('user:')) {
    // Update existing user preset
    const index = parseInt(currentPresetKey.split(':')[1], 10);
    presetManager.updateUser(index, code);
    presetManager.renameUser(index, name);
    rebuildPresetSelect(currentPresetKey);
  } else {
    // Save as new user preset (don't overwrite built-ins)
    const key = presetManager.saveNew(name, code);
    rebuildPresetSelect(key);
    currentPresetKey = key;
  }
});

function updateDeleteButton() {
  deletePresetBtn.style.display = currentPresetKey.startsWith('user:') ? '' : 'none';
}

deletePresetBtn.addEventListener('click', () => {
  if (!currentPresetKey.startsWith('user:')) return;
  const index = parseInt(currentPresetKey.split(':')[1], 10);
  presetManager.deleteUser(index);
  currentPresetKey = 'builtin:0';
  rebuildPresetSelect(currentPresetKey);
  applyPresetByKey(currentPresetKey);
});

/* ── Export / Import ── */
exportPresetBtn.addEventListener('click', () => {
  const preset = presetManager.getByKey(currentPresetKey);
  if (preset) presetManager.exportPreset(preset);
});

importPresetIn.addEventListener('change', async () => {
  const file = importPresetIn.files?.[0];
  if (!file) return;
  const key = await presetManager.importPreset(file);
  if (key) {
    rebuildPresetSelect(key);
    applyPresetByKey(key);
    if (!editorOpen) toggleEditor(true);
  }
  importPresetIn.value = '';
});

/* ── Preset selector ── */
presetSelect.addEventListener('change', () => {
  applyPresetByKey(presetSelect.value);
});

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
  // Don't intercept when typing in editor or inputs
  if (
    e.target instanceof HTMLInputElement ||
    e.target instanceof HTMLSelectElement ||
    e.target instanceof HTMLTextAreaElement ||
    (e.target as HTMLElement)?.closest?.('#monaco-container')
  ) return;

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
    case 'e':
    case 'E':
      toggleEditor();
      break;
    case 'Escape':
      if (editorOpen) toggleEditor(false);
      break;
  }
});

/* ── Animation loop ── */
let lastTime = -1;

const silentData: AudioData = {
  frequencyData: new Uint8Array(512),
  timeDomainData: new Uint8Array(512).fill(128),
  bass: 0, mid: 0, treble: 0, beat: 0,
  spectralCentroid: 0, bpm: 0,
};

function frame(now: number) {
  // Avoid huge dt spike on first frame
  if (lastTime < 0) lastTime = now;

  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(canvas.clientWidth * dpr);
  const h = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }

  const dt = (now - lastTime) / 1000;
  lastTime = now;

  const timeSec = now / 1000;
  const audioData = audio.playing
    ? (wasmAnalyzer?.getData(timeSec) ?? fallbackAnalyzer.getData())
    : silentData;
  renderer.render(timeSec, dt, audioData);

  // Update time display (unless user is dragging the seek bar)
  if (!seeking && audio.duration > 0) {
    timeCurrent.textContent = formatTime(audio.currentTime);
    seekBar.value = String((audio.currentTime / audio.duration) * 1000);
  }

  // Feed live context to editor and inspector when editor is open
  if (editorOpen) {
    const renderScale = renderer.renderScale;
    const ctx: LiveContext = {
      audio: audioData,
      time: timeSec,
      timeDelta: dt,
      resolution: [
        Math.round(w * renderScale),
        Math.round(h * renderScale),
      ],
      frame: renderer.frameCount,
    };

    shaderEditor.liveContext = ctx;
    inspector.update(ctx);
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
