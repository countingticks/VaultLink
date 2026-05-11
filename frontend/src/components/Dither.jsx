/* eslint-disable react/no-unknown-property */
import { forwardRef, useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, wrapEffect } from "@react-three/postprocessing";
import { Effect } from "postprocessing";
import * as THREE from "three";

import "./Dither.css";

const waveVertexShader = `
precision highp float;
varying vec2 vUv;

void main() {
  vUv = uv;
  vec4 modelPosition = modelMatrix * vec4(position, 1.0);
  vec4 viewPosition = viewMatrix * modelPosition;
  gl_Position = projectionMatrix * viewPosition;
}
`;

const waveFragmentShader = `
precision highp float;

uniform vec2 resolution;
uniform float time;
uniform float waveSpeed;
uniform float waveFrequency;
uniform float waveAmplitude;
uniform vec3 waveColor;
uniform vec2 mousePos;
uniform int enableMouseInteraction;
uniform float mouseRadius;

vec4 mod289(vec4 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
vec2 fade(vec2 t) { return t*t*t*(t*(t*6.0-15.0)+10.0); }

float cnoise(vec2 P) {
  vec4 Pi = floor(P.xyxy) + vec4(0.0,0.0,1.0,1.0);
  vec4 Pf = fract(P.xyxy) - vec4(0.0,0.0,1.0,1.0);
  Pi = mod289(Pi);
  vec4 ix = Pi.xzxz;
  vec4 iy = Pi.yyww;
  vec4 fx = Pf.xzxz;
  vec4 fy = Pf.yyww;
  vec4 i = permute(permute(ix) + iy);
  vec4 gx = fract(i * (1.0/41.0)) * 2.0 - 1.0;
  vec4 gy = abs(gx) - 0.5;
  vec4 tx = floor(gx + 0.5);
  gx = gx - tx;
  vec2 g00 = vec2(gx.x, gy.x);
  vec2 g10 = vec2(gx.y, gy.y);
  vec2 g01 = vec2(gx.z, gy.z);
  vec2 g11 = vec2(gx.w, gy.w);
  vec4 norm = taylorInvSqrt(vec4(dot(g00,g00), dot(g01,g01), dot(g10,g10), dot(g11,g11)));
  g00 *= norm.x; g01 *= norm.y; g10 *= norm.z; g11 *= norm.w;
  float n00 = dot(g00, vec2(fx.x, fy.x));
  float n10 = dot(g10, vec2(fx.y, fy.y));
  float n01 = dot(g01, vec2(fx.z, fy.z));
  float n11 = dot(g11, vec2(fx.w, fy.w));
  vec2 fade_xy = fade(Pf.xy);
  vec2 n_x = mix(vec2(n00, n01), vec2(n10, n11), fade_xy.x);
  return 2.3 * mix(n_x.x, n_x.y, fade_xy.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amp = 1.0;
  float freq = waveFrequency;
  for (int i = 0; i < 4; i++) {
    value += amp * abs(cnoise(p));
    p *= freq;
    amp *= waveAmplitude;
  }
  return value;
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec2 centered = uv - 0.5;
  centered.x *= resolution.x / resolution.y;

  float terminalRows = sin((uv.y * resolution.y * 0.42) - time * 10.0) * 0.018;
  float terminalCols = step(0.982, fract((uv.x + time * 0.006) * 34.0)) * 0.055;
  float packets = step(0.935, fract((uv.x * 7.0) + (uv.y * 17.0) - time * 0.38)) * 0.07;

  vec2 drift = vec2(time * waveSpeed, -time * waveSpeed * 0.42);
  vec2 fieldCoord = centered;
  float mouseWake = 0.0;
  float mouseTexture = 0.0;

  if (enableMouseInteraction == 1) {
    vec2 mouseNDC = (mousePos / resolution - 0.5) * vec2(1.0, -1.0);
    mouseNDC.x *= resolution.x / resolution.y;

    vec2 delta = centered - mouseNDC;
    vec2 flow = vec2(
      fbm(centered * 2.8 + vec2(time * 0.1, -time * 0.03)),
      fbm(centered * 2.8 + vec2(-time * 0.04, -time * 0.09))
    ) - 0.5;
    vec2 waveCoord = delta + flow * 0.16;
    float distanceFalloff = 1.0 - smoothstep(mouseRadius * 0.22, mouseRadius * 1.95, length(waveCoord));
    float horizontalDrift = 0.5 + 0.5 * sin((waveCoord.x * 15.0) + (waveCoord.y * 3.8) - time * 2.2);
    float localTexture = fbm(centered * 4.8 + flow * 1.2 + vec2(time * 0.09, -time * 0.08));
    float softTexture = mix(0.76, 1.0, localTexture);
    mouseWake = distanceFalloff * mix(0.62, horizontalDrift, 0.18) * softTexture;
    mouseTexture = localTexture;
    fieldCoord += flow * mouseWake * 0.14;
    drift += vec2(mouseWake * 0.018, -mouseWake * 0.01);
  }

  float signal = fbm(fieldCoord * 1.6 + drift);
  signal += terminalRows + terminalCols + packets;
  signal += mouseWake * (0.08 + mouseTexture * 0.04);

  vec3 ink = vec3(0.018, 0.016, 0.014);
  vec3 charcoal = vec3(0.125, 0.125, 0.125);
  vec3 wave = waveColor;
  vec3 col = mix(ink, charcoal, smoothstep(0.08, 0.85, signal));
  col = mix(col, wave, smoothstep(0.78, 1.25, signal) * 0.22);
  col = mix(col, wave, mouseWake * 0.18);

  gl_FragColor = vec4(col, 1.0);
}
`;

const ditherFragmentShader = `
precision highp float;

uniform float colorNum;
uniform float pixelSize;

const float bayerMatrix8x8[64] = float[64](
  0.0/64.0, 48.0/64.0, 12.0/64.0, 60.0/64.0,  3.0/64.0, 51.0/64.0, 15.0/64.0, 63.0/64.0,
  32.0/64.0,16.0/64.0, 44.0/64.0, 28.0/64.0, 35.0/64.0,19.0/64.0, 47.0/64.0, 31.0/64.0,
  8.0/64.0, 56.0/64.0,  4.0/64.0, 52.0/64.0, 11.0/64.0,59.0/64.0,  7.0/64.0, 55.0/64.0,
  40.0/64.0,24.0/64.0, 36.0/64.0, 20.0/64.0, 43.0/64.0,27.0/64.0, 39.0/64.0, 23.0/64.0,
  2.0/64.0, 50.0/64.0, 14.0/64.0, 62.0/64.0,  1.0/64.0,49.0/64.0, 13.0/64.0, 61.0/64.0,
  34.0/64.0,18.0/64.0, 46.0/64.0, 30.0/64.0, 33.0/64.0,17.0/64.0, 45.0/64.0, 29.0/64.0,
  10.0/64.0,58.0/64.0,  6.0/64.0, 54.0/64.0,  9.0/64.0,57.0/64.0,  5.0/64.0, 53.0/64.0,
  42.0/64.0,26.0/64.0, 38.0/64.0, 22.0/64.0, 41.0/64.0,25.0/64.0, 37.0/64.0, 21.0/64.0
);

vec3 dither(vec2 uv, vec3 color) {
  vec2 scaledCoord = floor(uv * resolution / pixelSize);
  int x = int(mod(scaledCoord.x, 8.0));
  int y = int(mod(scaledCoord.y, 8.0));
  float threshold = bayerMatrix8x8[y * 8 + x] - 0.25;
  float step = 1.0 / (colorNum - 1.0);
  color += threshold * step;
  return floor(clamp(color, 0.0, 1.0) * (colorNum - 1.0) + 0.5) / (colorNum - 1.0);
}

void mainImage(in vec4 inputColor, in vec2 uv, out vec4 outputColor) {
  vec2 normalizedPixelSize = pixelSize / resolution;
  vec2 uvPixel = normalizedPixelSize * floor(uv / normalizedPixelSize);
  vec4 color = texture2D(inputBuffer, uvPixel);
  color.rgb = dither(uv, color.rgb);
  outputColor = color;
}
`;

class RetroEffectImpl extends Effect {
  constructor() {
    const uniforms = new Map([
      ["colorNum", new THREE.Uniform(5.0)],
      ["pixelSize", new THREE.Uniform(3.0)],
    ]);
    super("RetroEffect", ditherFragmentShader, { uniforms });
    this.uniforms = uniforms;
  }

  set colorNum(value) {
    this.uniforms.get("colorNum").value = value;
  }

  set pixelSize(value) {
    this.uniforms.get("pixelSize").value = value;
  }
}

const WrappedRetro = wrapEffect(RetroEffectImpl);

const RetroEffect = forwardRef(({ colorNum, pixelSize }, ref) => (
  <WrappedRetro ref={ref} colorNum={colorNum} pixelSize={pixelSize} />
));
RetroEffect.displayName = "RetroEffect";

function DitheredWaves({
  waveSpeed,
  waveFrequency,
  waveAmplitude,
  waveColor,
  colorNum,
  pixelSize,
  disableAnimation,
  enableMouseInteraction,
  mouseRadius,
}) {
  const mouseRef = useRef(new THREE.Vector2());
  const { viewport, size, gl } = useThree();
  const waveUniformsRef = useRef({
    time: new THREE.Uniform(0),
    resolution: new THREE.Uniform(new THREE.Vector2(0, 0)),
    waveSpeed: new THREE.Uniform(waveSpeed),
    waveFrequency: new THREE.Uniform(waveFrequency),
    waveAmplitude: new THREE.Uniform(waveAmplitude),
    waveColor: new THREE.Uniform(new THREE.Color(...waveColor)),
    mousePos: new THREE.Uniform(new THREE.Vector2(0, 0)),
    enableMouseInteraction: new THREE.Uniform(enableMouseInteraction ? 1 : 0),
    mouseRadius: new THREE.Uniform(mouseRadius),
  });

  useEffect(() => {
    const dpr = gl.getPixelRatio();
    const width = Math.floor(size.width * dpr);
    const height = Math.floor(size.height * dpr);
    waveUniformsRef.current.resolution.value.set(width, height);
  }, [size, gl]);

  useEffect(() => {
    if (!enableMouseInteraction) return undefined;

    function handleWindowPointerMove(event) {
      const rect = gl.domElement.getBoundingClientRect();
      const dpr = gl.getPixelRatio();
      mouseRef.current.set((event.clientX - rect.left) * dpr, (event.clientY - rect.top) * dpr);
    }

    window.addEventListener("pointermove", handleWindowPointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", handleWindowPointerMove);
  }, [enableMouseInteraction, gl]);

  const prevColor = useRef([...waveColor]);
  useFrame(({ clock }) => {
    const uniforms = waveUniformsRef.current;
    if (!disableAnimation) {
      uniforms.time.value = clock.getElapsedTime();
    }
    uniforms.waveSpeed.value = waveSpeed;
    uniforms.waveFrequency.value = waveFrequency;
    uniforms.waveAmplitude.value = waveAmplitude;
    uniforms.enableMouseInteraction.value = enableMouseInteraction ? 1 : 0;
    uniforms.mouseRadius.value = mouseRadius;
    uniforms.mousePos.value.copy(mouseRef.current);

    if (!prevColor.current.every((value, index) => value === waveColor[index])) {
      uniforms.waveColor.value.set(...waveColor);
      prevColor.current = [...waveColor];
    }
  });

  function handlePointerMove(event) {
    if (!enableMouseInteraction) return;
    const rect = gl.domElement.getBoundingClientRect();
    const dpr = gl.getPixelRatio();
    mouseRef.current.set((event.clientX - rect.left) * dpr, (event.clientY - rect.top) * dpr);
  }

  return (
    <>
      <mesh scale={[viewport.width, viewport.height, 1]}>
        <planeGeometry args={[1, 1]} />
        <shaderMaterial vertexShader={waveVertexShader} fragmentShader={waveFragmentShader} uniforms={waveUniformsRef.current} />
      </mesh>
      <EffectComposer>
        <RetroEffect colorNum={colorNum} pixelSize={pixelSize} />
      </EffectComposer>
      <mesh onPointerMove={handlePointerMove} position={[0, 0, 0.01]} scale={[viewport.width, viewport.height, 1]} visible={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
    </>
  );
}

export default function Dither({
  waveSpeed = 0.03,
  waveFrequency = 2.5,
  waveAmplitude = 0.3,
  waveColor = [1, 1, 1],
  colorNum = 6,
  pixelSize = 3,
  disableAnimation = false,
  enableMouseInteraction = true,
  mouseRadius = 0.2,
}) {
  return (
    <Canvas className="dither-container" camera={{ position: [0, 0, 6] }} dpr={[1, 1.5]} gl={{ antialias: false }}>
      <DitheredWaves
        waveSpeed={waveSpeed}
        waveFrequency={waveFrequency}
        waveAmplitude={waveAmplitude}
        waveColor={waveColor}
        colorNum={colorNum}
        pixelSize={pixelSize}
        disableAnimation={disableAnimation}
        enableMouseInteraction={enableMouseInteraction}
        mouseRadius={mouseRadius}
      />
    </Canvas>
  );
}
