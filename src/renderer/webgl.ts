import { VERTEX_SHADER, FRAGMENT_HEADER } from './shaders';
import type { AudioData } from '../audio/analyzer';

/**
 * WebGL2 renderer that draws a fullscreen quad with a user-supplied
 * fragment shader, fed by an audio data texture and uniforms.
 */
export class Renderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject;
  private audioTex: WebGLTexture;
  private texBuf: Uint8Array; // 512 * 2 bytes packed for texture upload

  // Uniform locations (refreshed on each setShader)
  private loc: Record<string, WebGLUniformLocation | null> = {};

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
    if (!gl) throw new Error('WebGL 2 is not supported in this browser.');
    this.gl = gl;

    this.vao = this.initQuad();
    this.audioTex = this.initAudioTexture();
    this.texBuf = new Uint8Array(512 * 2);
  }

  /* ── Geometry ── */

  private initQuad(): WebGLVertexArrayObject {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);

    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    // Triangle-strip fullscreen quad: 4 verts
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
    // 512 wide × 2 tall, single-channel R8
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.R8,
      512, 2, 0,
      gl.RED, gl.UNSIGNED_BYTE,
      new Uint8Array(512 * 2),
    );
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
    gl.texSubImage2D(
      gl.TEXTURE_2D, 0,
      0, 0, 512, 2,
      gl.RED, gl.UNSIGNED_BYTE,
      this.texBuf,
    );
  }

  /* ── Shader Compilation ── */

  setShader(fragmentBody: string): { success: boolean; error?: string } {
    const gl = this.gl;
    const fragSrc = FRAGMENT_HEADER + fragmentBody;

    const vs = this.compile(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = this.compile(gl.FRAGMENT_SHADER, fragSrc);
    if (!vs || !fs) {
      const err = !vs ? 'vertex shader error' : gl.getShaderInfoLog(fs!) ?? 'fragment shader error';
      return { success: false, error: err };
    }

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const err = gl.getProgramInfoLog(prog) ?? 'link error';
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      return { success: false, error: err };
    }

    // Swap programs
    if (this.program) gl.deleteProgram(this.program);
    this.program = prog;
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    // Cache uniform locations
    this.loc = {};
    for (const name of [
      'iTime', 'iTimeDelta', 'iResolution', 'iChannel0',
      'iBass', 'iMid', 'iTreble', 'iBeat',
      'iSpectralCentroid', 'iBPM',
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
      console.error(gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  /* ── Render ── */

  render(time: number, timeDelta: number, audio: AudioData): void {
    const gl = this.gl;
    if (!this.program) return;

    this.uploadAudioData(audio);

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.useProgram(this.program);

    // Uniforms
    gl.uniform1f(this.loc['iTime'], time);
    gl.uniform1f(this.loc['iTimeDelta'], timeDelta);
    gl.uniform2f(this.loc['iResolution'], gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform1i(this.loc['iChannel0'], 0); // texture unit 0
    gl.uniform1f(this.loc['iBass'], audio.bass);
    gl.uniform1f(this.loc['iMid'], audio.mid);
    gl.uniform1f(this.loc['iTreble'], audio.treble);
    gl.uniform1f(this.loc['iBeat'], audio.beat);
    gl.uniform1f(this.loc['iSpectralCentroid'], audio.spectralCentroid);
    gl.uniform1f(this.loc['iBPM'], audio.bpm);

    // Draw fullscreen quad
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  resize(): void {
    // Viewport is set each frame in render(), nothing else needed
  }
}
