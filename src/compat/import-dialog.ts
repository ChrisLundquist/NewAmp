/**
 * Import dialog for pasting ShaderToy / MilkDrop shader code.
 *
 * Provides a modal where the user can:
 *   1. Paste raw shader code
 *   2. Auto-detect format (ShaderToy GLSL, MilkDrop HLSL, or native NewAmp)
 *   3. Convert and load as a new preset
 *   4. Or import a .milk file
 */

import { isShaderToyCode, wrapShaderToyCode, SHADERTOY_PREAMBLE_LINES } from './shadertoy';
import { isMilkDropCode, wrapMilkDropCode, parseMilkFile, MILKDROP_PREAMBLE_LINES } from './milkdrop';

export type ShaderFormat = 'shadertoy' | 'milkdrop' | 'native';

export interface ImportResult {
  name: string;
  code: string;
  format: ShaderFormat;
  /** Extra header lines added by the compatibility shim (for error mapping). */
  preambleLines: number;
}

/** Detect the format of pasted shader code. */
export function detectFormat(code: string): ShaderFormat {
  if (isShaderToyCode(code)) return 'shadertoy';
  if (isMilkDropCode(code)) return 'milkdrop';
  return 'native';
}

/** Convert shader code from detected format to NewAmp-compatible GLSL. */
export function convertShader(code: string, format?: ShaderFormat): ImportResult {
  const detected = format ?? detectFormat(code);

  switch (detected) {
    case 'shadertoy':
      return {
        name: 'ShaderToy Import',
        code: wrapShaderToyCode(code),
        format: 'shadertoy',
        preambleLines: SHADERTOY_PREAMBLE_LINES,
      };

    case 'milkdrop':
      return {
        name: 'MilkDrop Import',
        code: wrapMilkDropCode(code),
        format: 'milkdrop',
        preambleLines: MILKDROP_PREAMBLE_LINES,
      };

    case 'native':
    default:
      return {
        name: 'Imported Shader',
        code,
        format: 'native',
        preambleLines: 0,
      };
  }
}

/** Convert a .milk file to NewAmp-compatible GLSL (prefers composite shader). */
export function convertMilkFile(milkText: string): ImportResult | null {
  const parsed = parseMilkFile(milkText);
  const hlsl = parsed.compShader ?? parsed.warpShader;
  if (!hlsl) return null;

  return {
    name: parsed.name,
    code: wrapMilkDropCode(hlsl),
    format: 'milkdrop',
    preambleLines: MILKDROP_PREAMBLE_LINES,
  };
}

// ──────────────────────────────────────────────────────────────────────
// DOM: Import dialog
// ──────────────────────────────────────────────────────────────────────

const FORMAT_LABELS: Record<ShaderFormat, string> = {
  shadertoy: 'ShaderToy',
  milkdrop: 'MilkDrop (HLSL)',
  native: 'NewAmp (native GLSL)',
};

/**
 * Create and manage the import dialog DOM.
 * Call `createImportDialog()` once; it returns an object with show/hide.
 */
export function createImportDialog(onImport: (result: ImportResult) => void) {
  // Overlay
  const overlay = document.createElement('div');
  overlay.id = 'import-dialog-overlay';
  overlay.className = 'import-overlay hidden';

  // Dialog
  const dialog = document.createElement('div');
  dialog.className = 'import-dialog';

  dialog.innerHTML = `
    <div class="import-header">
      <h3>Import Shader</h3>
      <button class="import-close" title="Close">&times;</button>
    </div>
    <div class="import-body">
      <div class="import-tabs">
        <button class="import-tab active" data-tab="paste">Paste Code</button>
        <button class="import-tab" data-tab="file">Import .milk File</button>
      </div>
      <div class="import-tab-content" data-content="paste">
        <textarea class="import-textarea" placeholder="Paste ShaderToy or MilkDrop HLSL shader code here..." spellcheck="false"></textarea>
        <div class="import-format-row">
          <span class="import-format-label">Detected format:</span>
          <span class="import-format-value">—</span>
        </div>
      </div>
      <div class="import-tab-content hidden" data-content="file">
        <div class="import-file-drop">
          <p>Drop a <strong>.milk</strong> file here or click to browse</p>
          <input type="file" class="import-file-input" accept=".milk,.txt" />
        </div>
        <div class="import-file-name hidden"></div>
      </div>
    </div>
    <div class="import-footer">
      <button class="import-btn import-btn-cancel">Cancel</button>
      <button class="import-btn import-btn-convert" disabled>Convert &amp; Load</button>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // Refs
  const closeBtn = dialog.querySelector('.import-close') as HTMLButtonElement;
  const cancelBtn = dialog.querySelector('.import-btn-cancel') as HTMLButtonElement;
  const convertBtn = dialog.querySelector('.import-btn-convert') as HTMLButtonElement;
  const textarea = dialog.querySelector('.import-textarea') as HTMLTextAreaElement;
  const formatValue = dialog.querySelector('.import-format-value') as HTMLSpanElement;
  const tabs = dialog.querySelectorAll('.import-tab') as NodeListOf<HTMLButtonElement>;
  const tabContents = dialog.querySelectorAll('.import-tab-content') as NodeListOf<HTMLDivElement>;
  const fileInput = dialog.querySelector('.import-file-input') as HTMLInputElement;
  const fileNameEl = dialog.querySelector('.import-file-name') as HTMLDivElement;
  const fileDropZone = dialog.querySelector('.import-file-drop') as HTMLDivElement;

  let currentTab: 'paste' | 'file' = 'paste';
  let milkFileContent: string | null = null;

  // Tab switching
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab as 'paste' | 'file';
      currentTab = tabName;
      tabs.forEach((t) => t.classList.toggle('active', t === tab));
      tabContents.forEach((tc) =>
        tc.classList.toggle('hidden', tc.dataset.content !== tabName),
      );
      updateConvertBtn();
    });
  });

  // Textarea input → detect format
  textarea.addEventListener('input', () => {
    const code = textarea.value.trim();
    if (!code) {
      formatValue.textContent = '—';
      convertBtn.disabled = true;
      return;
    }
    const fmt = detectFormat(code);
    formatValue.textContent = FORMAT_LABELS[fmt];
    convertBtn.disabled = false;
  });

  // File input
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) handleMilkFile(file);
  });

  // File drop
  fileDropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    fileDropZone.classList.add('dragover');
  });
  fileDropZone.addEventListener('dragleave', () => {
    fileDropZone.classList.remove('dragover');
  });
  fileDropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    fileDropZone.classList.remove('dragover');
    const file = e.dataTransfer?.files[0];
    if (file) handleMilkFile(file);
  });

  async function handleMilkFile(file: File) {
    milkFileContent = await file.text();
    fileNameEl.textContent = file.name;
    fileNameEl.classList.remove('hidden');
    updateConvertBtn();
  }

  function updateConvertBtn() {
    if (currentTab === 'paste') {
      convertBtn.disabled = !textarea.value.trim();
    } else {
      convertBtn.disabled = !milkFileContent;
    }
  }

  // Convert & Load
  convertBtn.addEventListener('click', () => {
    let result: ImportResult | null = null;

    if (currentTab === 'paste') {
      const code = textarea.value.trim();
      if (!code) return;
      result = convertShader(code);
    } else if (milkFileContent) {
      result = convertMilkFile(milkFileContent);
    }

    if (result) {
      onImport(result);
      hide();
    }
  });

  // Close
  function hide() {
    overlay.classList.add('hidden');
    textarea.value = '';
    formatValue.textContent = '—';
    milkFileContent = null;
    fileNameEl.classList.add('hidden');
    fileInput.value = '';
    convertBtn.disabled = true;
  }

  function show() {
    overlay.classList.remove('hidden');
    // Reset to paste tab
    currentTab = 'paste';
    tabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === 'paste'));
    tabContents.forEach((tc) =>
      tc.classList.toggle('hidden', tc.dataset.content !== 'paste'),
    );
    setTimeout(() => textarea.focus(), 50);
  }

  closeBtn.addEventListener('click', hide);
  cancelBtn.addEventListener('click', hide);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) hide();
  });

  return { show, hide };
}
