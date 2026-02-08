import { VERTEX_SHADER, FRAGMENT_HEADER } from './shaders';
import type { AudioData } from '../audio/analyzer';

/**
 * WebGL2 renderer with:
 *   - Fullscreen-quad fragment shader pipeline
 *   - Audio data texture (512×2, FFT + waveform)
 *   - Feedback buffer (iBackbuffer) via FBO ping-pong
 *   - Resolution scaling for performance
 */
export class Renderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private cachedVS: WebGLShader | null = null;
  private vao: WebGLVertexArrayObject;
  private audioTex: WebGLTexture;
  private texBuf: Uint8Array;

  // Feedback ping-pong FBOs
  private fboA!: WebGLFramebuffer;
  private fboB!: WebGLFramebuffer;
  private texA!: WebGLTexture;
  private texB!: WebGLTexture;
  private fboW = 0;
  private fboH = 0;
  private pingPong = false; // false → write A, read B; true → write B, read A

  // Resolution scale (0.25 – 1.0)
  private _renderScale = 1.0;

  // Uniform locations (refreshed on each setShader)
  private loc: Record<string, WebGLUniformLocation | null> = {};

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
    if (!gl) throw new Error('WebGL 2 is not supported in this browser.');
    this.gl = gl;

    this.vao = this.initQuad();
    this.audioTex = this.initAudioTexture();
    this.texBuf = new Uint8Array(512 * 2);
    this.initFBOs(1, 1); // will be resized on first render
  }

  get renderScale(): number {
    return this._renderScale;
  }

  set renderScale(v: number) {
    this._renderScale = Math.max(0.25, Math.min(1.0, v));
    // Force FBO recreate on next render
    this.fboW = 0;
    this.fboH = 0;
  }

  /* ── Geometry ── */

  private initQuad(): WebGLVertexArrayObject {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);

    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
    return vao;
  }

  /* ── Audio Texture ── */

  private initAudioTexture(): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 512, 2, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array(512 * 2));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  private uploadAudioData(audio: AudioData): void {
    const gl = this.gl;
    this.texBuf.set(audio.frequencyData.subarray(0, 512), 0);
    this.texBuf.set(audio.timeDomainData.subarray(0, 512), 512);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.audioTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 512, 2, gl.RED, gl.UNSIGNED_BYTE, this.texBuf);
  }

  /* ── Feedback FBOs ── */

  private initFBOs(w: number, h: number): void {
    const gl = this.gl;

    // Clean up old FBOs
    if (this.fboA) gl.deleteFramebuffer(this.fboA);
    if (this.fboB) gl.deleteFramebuffer(this.fboB);
    if (this.texA) gl.deleteTexture(this.texA);
    if (this.texB) gl.deleteTexture(this.texB);

    this.texA = this.createFboTexture(w, h);
    this.texB = this.createFboTexture(w, h);
    this.fboA = this.createFbo(this.texA);
    this.fboB = this.createFbo(this.texB);
    this.fboW = w;
    this.fboH = h;
  }

  private createFboTexture(w: number, h: number): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  private createFbo(tex: WebGLTexture): WebGLFramebuffer {
    const gl = this.gl;
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return fbo;
  }

  /* ── Shader Compilation ── */

  private getVertexShader(): WebGLShader | null {
    if (this.cachedVS) return this.cachedVS;
    this.cachedVS = this.compile(this.gl.VERTEX_SHADER, VERTEX_SHADER);
    return this.cachedVS;
  }

  setShader(fragmentBody: string): { success: boolean; error?: string } {
    const gl = this.gl;
    const fragSrc = FRAGMENT_HEADER + fragmentBody;

    const vs = this.getVertexShader();
    if (!vs) {
      return { success: false, error: 'Vertex shader compilation failed' };
    }

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, fragSrc);
    gl.compileShader(fs);

    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      const raw = gl.getShaderInfoLog(fs) ?? '';
      gl.deleteShader(fs);
      return { success: false, error: raw };
    }

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const err = gl.getProgramInfoLog(prog) ?? 'link error';
      gl.deleteProgram(prog);
      gl.deleteShader(fs);
      return { success: false, error: err };
    }

    if (this.program) gl.deleteProgram(this.program);
    this.program = prog;
    gl.deleteShader(fs);

    // Cache uniform locations
    this.loc = {};
    for (const name of [
      'iTime', 'iTimeDelta', 'iResolution', 'iChannel0',
      'iBass', 'iMid', 'iTreble', 'iBeat',
      'iSpectralCentroid', 'iBPM',
      'iBackbuffer', 'iFrame',
    ]) {
      this.loc[name] = gl.getUniformLocation(prog, name);
    }

    return { success: true };
  }

  private compile(type: number, src: string): WebGLShader | null {
    const gl = this.gl;
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  /* ── Render ── */

  frameCount = 0;

  render(time: number, timeDelta: number, audio: AudioData): void {
    const gl = this.gl;
    if (!this.program) return;

    // Determine render resolution (scaled)
    const canvasW = gl.drawingBufferWidth;
    const canvasH = gl.drawingBufferHeight;
    const renderW = Math.max(1, Math.round(canvasW * this._renderScale));
    const renderH = Math.max(1, Math.round(canvasH * this._renderScale));

    // Resize FBOs if needed
    if (renderW !== this.fboW || renderH !== this.fboH) {
      this.initFBOs(renderW, renderH);
    }

    this.uploadAudioData(audio);

    // Determine read/write FBOs
    const writeFbo = this.pingPong ? this.fboB : this.fboA;
    const readTex = this.pingPong ? this.texA : this.texB;

    // 1) Render shader to write FBO
    gl.bindFramebuffer(gl.FRAMEBUFFER, writeFbo);
    gl.viewport(0, 0, renderW, renderH);
    gl.useProgram(this.program);

    // Audio texture → unit 0
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.audioTex);
    gl.uniform1i(this.loc['iChannel0'], 0);

    // Backbuffer (previous frame) → unit 1
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, readTex);
    gl.uniform1i(this.loc['iBackbuffer'], 1);

    // Scalar uniforms
    gl.uniform1f(this.loc['iTime'], time);
    gl.uniform1f(this.loc['iTimeDelta'], timeDelta);
    gl.uniform2f(this.loc['iResolution'], renderW, renderH);
    gl.uniform1f(this.loc['iBass'], audio.bass);
    gl.uniform1f(this.loc['iMid'], audio.mid);
    gl.uniform1f(this.loc['iTreble'], audio.treble);
    gl.uniform1f(this.loc['iBeat'], audio.beat);
    gl.uniform1f(this.loc['iSpectralCentroid'], audio.spectralCentroid);
    gl.uniform1f(this.loc['iBPM'], audio.bpm);
    gl.uniform1f(this.loc['iFrame'], this.frameCount);

    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // 2) Blit from write FBO to canvas (default framebuffer)
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, writeFbo);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.blitFramebuffer(
      0, 0, renderW, renderH,
      0, 0, canvasW, canvasH,
      gl.COLOR_BUFFER_BIT,
      this._renderScale < 1.0 ? gl.LINEAR : gl.NEAREST,
    );

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // 3) Swap
    this.pingPong = !this.pingPong;
    this.frameCount++;
  }
}
