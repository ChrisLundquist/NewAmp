import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import { registerGLSL } from './glsl-lang';

// Monaco worker setup (only the base editor worker is needed for GLSL)
self.MonacoEnvironment = {
  getWorker: () => new editorWorker(),
};

registerGLSL();

export class ShaderEditor {
  private editor: monaco.editor.IStandaloneCodeEditor;
  private onChangeTimer: ReturnType<typeof setTimeout> | null = null;
  private _onChange: ((code: string) => void) | null = null;

  constructor(container: HTMLElement) {
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
    });

    this.editor.onDidChangeModelContent(() => {
      if (this.onChangeTimer) clearTimeout(this.onChangeTimer);
      this.onChangeTimer = setTimeout(() => {
        this._onChange?.(this.editor.getValue());
      }, 300);
    });
  }

  /** Register a debounced change callback (300ms). */
  set onChange(cb: (code: string) => void) {
    this._onChange = cb;
  }

  getValue(): string {
    return this.editor.getValue();
  }

  setValue(code: string): void {
    this.editor.setValue(code);
  }

  /** Show shader compilation errors as Monaco markers. */
  setErrors(errors: string[]): void {
    const model = this.editor.getModel();
    if (!model) return;

    const markers: monaco.editor.IMarkerData[] = errors.map((msg) => {
      // Try to parse "ERROR: 0:LINE: message" format from WebGL
      const match = msg.match(/ERROR:\s*\d+:(\d+):\s*(.*)/);
      // The line number from WebGL is relative to the FULL source (header + body).
      // Our header is a fixed number of lines. Subtract to get body-relative line.
      const headerLines = 12; // lines in FRAGMENT_HEADER
      const line = match ? Math.max(1, parseInt(match[1], 10) - headerLines) : 1;
      const message = match ? match[2] : msg;

      return {
        severity: monaco.MarkerSeverity.Error,
        message,
        startLineNumber: line,
        endLineNumber: line,
        startColumn: 1,
        endColumn: 1000,
      };
    });

    monaco.editor.setModelMarkers(model, 'glsl', markers);
  }

  clearErrors(): void {
    const model = this.editor.getModel();
    if (model) monaco.editor.setModelMarkers(model, 'glsl', []);
  }

  focus(): void {
    this.editor.focus();
  }

  layout(): void {
    this.editor.layout();
  }
}
