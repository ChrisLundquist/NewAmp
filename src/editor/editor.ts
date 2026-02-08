import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import { registerGLSL } from './glsl-lang';
import { FRAGMENT_HEADER_LINES } from '../renderer/shaders';
import { UNIFORM_MAP, type LiveContext } from './uniforms';

// Monaco worker setup
self.MonacoEnvironment = {
  getWorker: () => new editorWorker(),
};

registerGLSL();

export interface ParsedError {
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning';
  rawLine?: string;
}

export class ShaderEditor {
  private editor: monaco.editor.IStandaloneCodeEditor;
  private onChangeTimer: ReturnType<typeof setTimeout> | null = null;
  private _onChange: ((code: string) => void) | null = null;

  /** Updated each frame so hover provider can show live uniform values. */
  liveContext: LiveContext | null = null;

  constructor(container: HTMLElement) {
    this.registerHoverProvider();

    this.editor = monaco.editor.create(container, {
      language: 'glsl',
      theme: 'vs-dark',
      value: '',
      fontSize: 13,
      lineNumbers: 'on',
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: 2,
      wordWrap: 'on',
      renderWhitespace: 'none',
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      padding: { top: 8, bottom: 8 },
      glyphMargin: true,
    });

    this.editor.onDidChangeModelContent(() => {
      if (this.onChangeTimer) clearTimeout(this.onChangeTimer);
      this.onChangeTimer = setTimeout(() => {
        this._onChange?.(this.editor.getValue());
      }, 300);
    });
  }

  set onChange(cb: (code: string) => void) {
    this._onChange = cb;
  }

  getValue(): string {
    return this.editor.getValue();
  }

  setValue(code: string): void {
    this.editor.setValue(code);
  }

  /**
   * Parse raw WebGL shader log, show as Monaco markers, and return
   * structured errors for the error panel.
   */
  setErrors(rawLog: string): ParsedError[] {
    const model = this.editor.getModel();
    if (!model) return [];

    const parsed = parseShaderErrors(rawLog);
    const markers: monaco.editor.IMarkerData[] = parsed.map((e) => ({
      severity: e.severity === 'warning'
        ? monaco.MarkerSeverity.Warning
        : monaco.MarkerSeverity.Error,
      message: e.message,
      startLineNumber: e.line,
      endLineNumber: e.line,
      startColumn: 1,
      endColumn: 1000,
    }));

    monaco.editor.setModelMarkers(model, 'glsl', markers);

    if (parsed.length > 0) {
      this.editor.revealLineInCenter(parsed[0].line);
    }

    return parsed;
  }

  clearErrors(): void {
    const model = this.editor.getModel();
    if (model) monaco.editor.setModelMarkers(model, 'glsl', []);
  }

  /** Navigate to a specific line (for clickable error panel). */
  goToLine(line: number): void {
    this.editor.revealLineInCenter(line);
    this.editor.setPosition({ lineNumber: line, column: 1 });
    this.editor.focus();
  }

  focus(): void {
    this.editor.focus();
  }

  layout(): void {
    this.editor.layout();
  }

  /* ── Hover Provider: shows type, description, live value ── */

  private registerHoverProvider(): void {
    const self = this;

    monaco.languages.registerHoverProvider('glsl', {
      provideHover(_model, position) {
        const word = _model.getWordAtPosition(position);
        if (!word) return null;

        const info = UNIFORM_MAP.get(word.word);
        if (!info) return null;

        let md = `**\`${info.type}\` ${info.name}**\n\n${info.description}`;
        if (info.range) md += `\n\n**Range:** \`${info.range}\``;
        if (self.liveContext) {
          md += `\n\n**Current value:** \`${info.liveValue(self.liveContext)}\``;
        }

        return {
          range: new monaco.Range(
            position.lineNumber, word.startColumn,
            position.lineNumber, word.endColumn,
          ),
          contents: [{ value: md }],
        };
      },
    });
  }
}

/* ── Error Parsing ── */

function parseShaderErrors(log: string): ParsedError[] {
  if (!log.trim()) return [];
  const results: ParsedError[] = [];

  for (const raw of log.split('\n')) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    let line = 1;
    let column = 1;
    let message = trimmed;
    let severity: 'error' | 'warning' = 'error';

    // Format: ERROR: 0:LINE: message  (Chrome/Edge)
    const m1 = trimmed.match(/^(ERROR|WARNING):\s*\d+:(\d+):\s*(.*)/i);
    if (m1) {
      severity = m1[1].toLowerCase() === 'warning' ? 'warning' : 'error';
      line = parseInt(m1[2], 10);
      message = m1[3];
    } else {
      // Format: 0:LINE(COL): error: message  (Firefox)
      const m2 = trimmed.match(/^\d+:(\d+)(?:\((\d+)\))?:\s*(error|warning):\s*(.*)/i);
      if (m2) {
        line = parseInt(m2[1], 10);
        column = m2[2] ? parseInt(m2[2], 10) : 1;
        severity = m2[3].toLowerCase() === 'warning' ? 'warning' : 'error';
        message = m2[4];
      }
    }

    // Map from full-source line to user-code line
    line = Math.max(1, line - FRAGMENT_HEADER_LINES);
    results.push({ line, column, message, severity, rawLine: trimmed });
  }

  return results;
}
