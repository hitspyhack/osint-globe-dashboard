import type { SensorId } from "@/types";

export interface ShaderSensorPass {
  type: "shader";
  fragmentShader: string;
}

export interface BloomSensorPass {
  type: "bloom";
  strength: number;
  radius: number;
  threshold: number;
}

export type SensorPass = ShaderSensorPass | BloomSensorPass;

/**
 * Post-processing looks, applied through the globe's EffectComposer
 * (`globe.postProcessingComposer()`), so the whole 3D scene is processed —
 * not just a CSS filter over the canvas.
 */

const VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const NOISE_HELPERS = /* glsl */ `
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }
`;

/** Shared vignette + scanline helpers. */
const FRAME_HELPERS = /* glsl */ `
  // 1.0 inside \`inner\`, fading to 0.0 at \`outer\`. Written as an explicit
  // 1.0 - smoothstep(...) because smoothstep() with reversed edges is
  // undefined behaviour in the GLSL ES spec.
  float vignette(vec2 uv, float inner, float outer) {
    float d = length(uv - 0.5) * 1.4142;
    return 1.0 - smoothstep(inner, outer, d);
  }
`;

const NVG = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float time;
  uniform vec2 resolution;
  varying vec2 vUv;
  ${NOISE_HELPERS}
  ${FRAME_HELPERS}

  void main() {
    vec2 uv = vUv;

    // Image intensifier: integrate luminance, then crush to a phosphor ramp.
    vec3 src = texture2D(tDiffuse, uv).rgb;
    float lum = dot(src, vec3(0.299, 0.587, 0.114));
    lum = pow(clamp(lum * 1.9 + 0.02, 0.0, 1.0), 0.72);

    // Bloom-ish halo: sample a few neighbours so bright spots bleed.
    float halo = 0.0;
    for (int i = 0; i < 6; i++) {
      float a = float(i) * 1.0471975;
      vec2 offset = vec2(cos(a), sin(a)) * 0.004;
      halo += dot(texture2D(tDiffuse, uv + offset).rgb, vec3(0.299, 0.587, 0.114));
    }
    lum += (halo / 6.0) * 0.35;

    // Grain + rolling scanlines.
    float grain = (hash(uv * resolution + fract(time) * 91.7) - 0.5) * 0.16;
    float scan = 0.92 + 0.08 * sin(uv.y * resolution.y * 1.4 + time * 5.0);
    float vig = vignette(uv, 0.45, 1.25);

    float signal = clamp((lum + grain) * scan, 0.0, 1.0) * vig;
    vec3 phosphor = vec3(0.16, 1.0, 0.42) * signal;

    // Tube glow floor so pure black never looks dead.
    phosphor += vec3(0.0, 0.055, 0.02) * vig;

    gl_FragColor = vec4(phosphor, 1.0);
  }
`;

const THERMAL_RAMP = /* glsl */ `
  vec3 thermalRamp(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 c0 = vec3(0.00, 0.00, 0.08);
    vec3 c1 = vec3(0.24, 0.02, 0.42);
    vec3 c2 = vec3(0.72, 0.06, 0.32);
    vec3 c3 = vec3(0.96, 0.28, 0.05);
    vec3 c4 = vec3(1.00, 0.72, 0.10);
    vec3 c5 = vec3(1.00, 1.00, 0.94);
    if (t < 0.2) return mix(c0, c1, t / 0.2);
    if (t < 0.4) return mix(c1, c2, (t - 0.2) / 0.2);
    if (t < 0.6) return mix(c2, c3, (t - 0.4) / 0.2);
    if (t < 0.8) return mix(c3, c4, (t - 0.6) / 0.2);
    return mix(c4, c5, (t - 0.8) / 0.2);
  }
`;

const FLIR_COMMON = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float time;
  uniform vec2 resolution;
  varying vec2 vUv;
  ${NOISE_HELPERS}
  ${FRAME_HELPERS}
  ${THERMAL_RAMP}

  void main() {
    vec2 uv = vUv;
    vec3 src = texture2D(tDiffuse, uv).rgb;
    float heat = dot(src, vec3(0.299, 0.587, 0.114));

    // Micro-bolometer: slight blur + sensor noise, then the thermal LUT.
    float blur = 0.0;
    vec2 px = 1.5 / resolution;
    for (int x = -1; x <= 1; x++) {
      for (int y = -1; y <= 1; y++) {
        vec3 s = texture2D(tDiffuse, uv + vec2(float(x), float(y)) * px).rgb;
        blur += dot(s, vec3(0.299, 0.587, 0.114));
      }
    }
    heat = mix(heat, blur / 9.0, 0.55);
    heat = pow(clamp(heat, 0.0, 1.0), 0.85);

    heat += (hash(uv * resolution + fract(time) * 37.3) - 0.5) * 0.045;
    heat *= 0.93 + 0.07 * sin(uv.y * resolution.y * 0.9 + time * 2.0);
`;

const FLIR = /* glsl */ `
  ${FLIR_COMMON}
    vec3 color = thermalRamp(heat);
    gl_FragColor = vec4(color * vignette(uv, 0.5, 1.3), 1.0);
  }
`;

const FLIR_INV = /* glsl */ `
  ${FLIR_COMMON}
    // White-hot: hottest targets read as white on a dark background.
    vec3 color = thermalRamp(1.0 - heat);
    color = mix(color, vec3(1.0) - color, 0.15);
    gl_FragColor = vec4(color * vignette(uv, 0.5, 1.3), 1.0);
  }
`;

const CRT = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float time;
  uniform vec2 resolution;
  varying vec2 vUv;
  ${NOISE_HELPERS}
  ${FRAME_HELPERS}

  void main() {
    // Barrel distortion.
    vec2 uv = vUv - 0.5;
    float r2 = dot(uv, uv);
    uv *= 1.0 + 0.18 * r2;
    uv += 0.5;

    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      gl_FragColor = vec4(0.01, 0.02, 0.03, 1.0);
      return;
    }

    // Chromatic convergence error, growing towards the edges.
    float shift = 0.0016 + r2 * 0.006;
    vec3 src;
    src.r = texture2D(tDiffuse, uv + vec2(shift, 0.0)).r;
    src.g = texture2D(tDiffuse, uv).g;
    src.b = texture2D(tDiffuse, uv - vec2(shift, 0.0)).b;

    // Scanlines, aperture grille, rolling refresh bar.
    float scan = 0.86 + 0.14 * sin(uv.y * resolution.y * 1.7);
    float grille = 0.94 + 0.06 * sin(uv.x * resolution.x * 3.1);
    float roll = 0.97 + 0.03 * sin(uv.y * 6.0 - time * 2.2);
    float grain = (hash(uv * resolution + fract(time) * 13.7) - 0.5) * 0.07;

    vec3 color = src * scan * grille * roll + grain;
    color *= 0.85 + 0.15 * vignette(uv, 0.45, 1.25);

    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
  }
`;

const NOIR = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float time;
  uniform vec2 resolution;
  varying vec2 vUv;
  ${NOISE_HELPERS}
  ${FRAME_HELPERS}

  void main() {
    vec2 uv = vUv;
    vec3 src = texture2D(tDiffuse, uv).rgb;
    float lum = dot(src, vec3(0.299, 0.587, 0.114));

    // S-curve for punchy blacks.
    lum = clamp((lum - 0.5) * 1.85 + 0.5, 0.0, 1.0);
    lum = pow(lum, 1.08);

    vec3 color = vec3(lum);
    color = mix(color, color * vec3(0.92, 0.96, 1.12), 0.35); // cool cast
    color += (hash(uv * resolution + fract(time) * 71.1) - 0.5) * 0.06;

    gl_FragColor = vec4(color * vignette(uv, 0.5, 1.3), 1.0);
  }
`;

const SNOW = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float time;
  uniform vec2 resolution;
  varying vec2 vUv;
  ${NOISE_HELPERS}
  ${FRAME_HELPERS}

  void main() {
    vec2 uv = vUv;
    vec3 src = texture2D(tDiffuse, uv).rgb;

    // Low-light sensor: crush saturation, lift the floor, add drifting snow.
    float lum = dot(src, vec3(0.299, 0.587, 0.114));
    lum = clamp(lum * 0.82 + 0.14, 0.0, 1.0);

    float snow = noise(uv * resolution * 0.35 + vec2(time * 12.0, time * 26.0));
    lum += (snow - 0.5) * 0.22;
    lum += (hash(uv * resolution + fract(time) * 5.3) - 0.5) * 0.1;

    vec3 color = mix(vec3(lum), vec3(lum) * vec3(0.88, 0.93, 1.0), 0.6);
    gl_FragColor = vec4(clamp(color, 0.0, 1.0) * vignette(uv, 0.4, 1.2), 1.0);
  }
`;

export const SENSOR_PASSES: Record<SensorId, SensorPass[]> = {
  standard: [],
  nvg: [{ type: "shader", fragmentShader: NVG }],
  flir: [{ type: "shader", fragmentShader: FLIR }],
  "flir-inv": [{ type: "shader", fragmentShader: FLIR_INV }],
  crt: [{ type: "shader", fragmentShader: CRT }],
  noir: [{ type: "shader", fragmentShader: NOIR }],
  snow: [{ type: "shader", fragmentShader: SNOW }],
  bloom: [{ type: "bloom", strength: 0.85, radius: 0.5, threshold: 0.72 }],
};

export const SHADER_VERTEX = VERTEX_SHADER;

/** Extra CSS treatment layered over the canvas for each look. */
export const SENSOR_CHROME: Record<SensorId, string> = {
  standard: "",
  nvg: "chrome-nvg",
  flir: "chrome-thermal",
  "flir-inv": "chrome-thermal",
  crt: "chrome-crt",
  noir: "chrome-noir",
  snow: "chrome-snow",
  bloom: "",
};
