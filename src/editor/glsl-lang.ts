import * as monaco from 'monaco-editor';

/** Register a GLSL language with Monarch tokenizer for Monaco. */
export function registerGLSL() {
  monaco.languages.register({ id: 'glsl' });

  monaco.languages.setMonarchTokensProvider('glsl', {
    keywords: [
      'attribute', 'const', 'uniform', 'varying', 'layout',
      'break', 'continue', 'do', 'for', 'while', 'if', 'else',
      'in', 'out', 'inout', 'discard', 'return', 'struct',
      'precision', 'highp', 'mediump', 'lowp',
      'true', 'false',
    ],
    typeKeywords: [
      'void', 'bool', 'int', 'uint', 'float', 'double',
      'vec2', 'vec3', 'vec4',
      'ivec2', 'ivec3', 'ivec4',
      'uvec2', 'uvec3', 'uvec4',
      'bvec2', 'bvec3', 'bvec4',
      'mat2', 'mat3', 'mat4',
      'mat2x2', 'mat2x3', 'mat2x4',
      'mat3x2', 'mat3x3', 'mat3x4',
      'mat4x2', 'mat4x3', 'mat4x4',
      'sampler2D', 'sampler3D', 'samplerCube',
      'sampler2DShadow', 'samplerCubeShadow',
      'sampler2DArray', 'sampler2DArrayShadow',
      'isampler2D', 'isampler3D', 'isamplerCube',
      'usampler2D', 'usampler3D', 'usamplerCube',
    ],
    builtinFunctions: [
      'radians', 'degrees', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
      'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
      'pow', 'exp', 'log', 'exp2', 'log2', 'sqrt', 'inversesqrt',
      'abs', 'sign', 'floor', 'ceil', 'trunc', 'round', 'fract',
      'mod', 'min', 'max', 'clamp', 'mix', 'step', 'smoothstep',
      'length', 'distance', 'dot', 'cross', 'normalize', 'faceforward',
      'reflect', 'refract',
      'texture', 'textureLod', 'textureGrad', 'texelFetch',
      'dFdx', 'dFdy', 'fwidth',
    ],
    builtinVariables: [
      'gl_Position', 'gl_FragCoord', 'gl_FragDepth', 'gl_VertexID',
      'gl_InstanceID', 'gl_FrontFacing', 'gl_PointSize',
    ],

    operators: [
      '=', '>', '<', '!', '~', '?', ':',
      '==', '<=', '>=', '!=', '&&', '||', '++', '--',
      '+', '-', '*', '/', '&', '|', '^', '%', '<<', '>>',
      '+=', '-=', '*=', '/=', '&=', '|=', '^=', '%=',
      '<<=', '>>=',
    ],

    symbols: /[=><!~?:&|+\-*/^%]+/,
    digits: /\d+(_+\d+)*/,
    octaldigits: /[0-7]+(_+[0-7]+)*/,
    hexdigits: /[[0-9a-fA-F]+(_+[0-9a-fA-F]+)*/,

    tokenizer: {
      root: [
        // Preprocessor
        [/#\s*\w+/, 'keyword.directive'],

        // Identifiers and keywords
        [/[a-zA-Z_]\w*/, {
          cases: {
            '@typeKeywords': 'type',
            '@keywords': 'keyword',
            '@builtinFunctions': 'support.function',
            '@builtinVariables': 'variable.predefined',
            '@default': 'identifier',
          },
        }],

        // Whitespace
        { include: '@whitespace' },

        // Numbers
        [/\d*\.\d+([eE][-+]?\d+)?[fF]?/, 'number.float'],
        [/0[xX]@hexdigits/, 'number.hex'],
        [/0@octaldigits/, 'number.octal'],
        [/\d+[uU]?/, 'number'],

        // Delimiters and operators
        [/[{}()[\]]/, '@brackets'],
        [/@symbols/, {
          cases: {
            '@operators': 'operator',
            '@default': '',
          },
        }],

        // Separator
        [/[;,.]/, 'delimiter'],
      ],

      whitespace: [
        [/[ \t\r\n]+/, 'white'],
        [/\/\*/, 'comment', '@comment'],
        [/\/\/.*$/, 'comment'],
      ],

      comment: [
        [/[^/*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/[/*]/, 'comment'],
      ],
    },
  });

  // Register NewAmp-specific completions for shader uniforms
  monaco.languages.registerCompletionItemProvider('glsl', {
    provideCompletionItems: (_model, position) => {
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: position.column,
        endColumn: position.column,
      };
      const suggestions: monaco.languages.CompletionItem[] = [
        { label: 'iTime', kind: monaco.languages.CompletionItemKind.Variable, insertText: 'iTime', detail: 'float — playback time (seconds)', range },
        { label: 'iTimeDelta', kind: monaco.languages.CompletionItemKind.Variable, insertText: 'iTimeDelta', detail: 'float — time since last frame', range },
        { label: 'iResolution', kind: monaco.languages.CompletionItemKind.Variable, insertText: 'iResolution', detail: 'vec2 — viewport resolution (px)', range },
        { label: 'iChannel0', kind: monaco.languages.CompletionItemKind.Variable, insertText: 'iChannel0', detail: 'sampler2D — audio texture (FFT row0, wave row1)', range },
        { label: 'iBass', kind: monaco.languages.CompletionItemKind.Variable, insertText: 'iBass', detail: 'float — bass energy 0-1', range },
        { label: 'iMid', kind: monaco.languages.CompletionItemKind.Variable, insertText: 'iMid', detail: 'float — mid energy 0-1', range },
        { label: 'iTreble', kind: monaco.languages.CompletionItemKind.Variable, insertText: 'iTreble', detail: 'float — treble energy 0-1', range },
        { label: 'iBeat', kind: monaco.languages.CompletionItemKind.Variable, insertText: 'iBeat', detail: 'float — beat intensity 0-1', range },
        { label: 'vUv', kind: monaco.languages.CompletionItemKind.Variable, insertText: 'vUv', detail: 'vec2 — UV coordinates 0-1', range },
        { label: 'fragColor', kind: monaco.languages.CompletionItemKind.Variable, insertText: 'fragColor', detail: 'vec4 — output color', range },
      ];
      return { suggestions };
    },
  });
}
