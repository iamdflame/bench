/**
 * GLSL for the floor.
 *
 * Written directly against WebGL2 rather than pulled from a scene library.
 * The floor has exactly two draw calls — a fullscreen field and one instanced
 * pass for every body on it — which keeps it inside the budget of the weakest
 * machine likely to open it, and keeps the visual specific to this product
 * instead of recognisably belonging to somebody's renderer.
 *
 * Nothing here is decorative. The field's turbulence is aggregate realized
 * alpha, a body's radius is capital under mandate, its ring is the bond still
 * at risk, and its tremor is accumulated strikes. When the market is calm the
 * floor is nearly still; when capital is being lost it is visibly disturbed.
 */

export const FIELD_VERT = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

/**
 * The capital field.
 *
 * Domain-warped value noise: cheap enough for integrated graphics, and the
 * warp is what stops it reading as a plasma demo. `uStress` is the market's
 * aggregate loss, and it drives both the warp amplitude and the palette, so a
 * bad epoch is legible from across a room before a single number is read.
 */
export const FIELD_FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform vec2  uResolution;
uniform float uTime;
uniform float uStress;     // 0 = calm, 1 = capital burning
uniform float uFlow;       // aggregate capital in motion, normalised
uniform vec3  uInk;
uniform vec3  uGround;
uniform vec3  uGold;
uniform float uPulse;      // decays from 1 on each settlement

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
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

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p *= 2.02;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = vUv;
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 p = vec2(uv.x * aspect, uv.y);

  float t = uTime * 0.035;

  // Domain warp. Amplitude rises with stress, so the floor churns when the
  // market is losing money and lies almost flat when it is not.
  float warpAmt = 0.35 + uStress * 1.15;
  vec2 q = vec2(fbm(p * 2.2 + vec2(0.0, t)), fbm(p * 2.2 + vec2(5.2, -t)));
  vec2 r = vec2(
    fbm(p * 2.6 + warpAmt * q + vec2(1.7, 9.2) + t * 1.4),
    fbm(p * 2.6 + warpAmt * q + vec2(8.3, 2.8) - t * 1.1)
  );
  float f = fbm(p * 3.0 + warpAmt * r);

  // Contour lines: a topographic read, so the field looks surveyed rather
  // than rendered.
  float bands = abs(fract(f * 7.0 + uFlow * 0.6) - 0.5);
  float contour = smoothstep(0.46, 0.5, bands);

  vec3 col = uGround;
  col = mix(col, uInk, f * 0.16);
  col = mix(col, uInk * 1.35, contour * 0.06);

  // Gold appears only where the field is genuinely hot, and only when the
  // market is under stress. It is the one accent, and it has to be earned.
  float hot = smoothstep(0.62, 0.92, f) * uStress;
  col = mix(col, uGold, hot * 0.30);

  // A settlement lifts the whole field very slightly, so the room registers
  // that something happened without a ring appearing from nowhere.
  float d = length(vec2((uv.x - 0.5) * aspect, uv.y - 0.5));
  col += uGold * uPulse * 0.020 * smoothstep(1.1, 0.1, d);

  // Vignette, and a little grain so flat regions do not band on 8-bit panels.
  col *= 1.0 - 0.35 * smoothstep(0.35, 1.05, d);
  col += (hash(uv * uResolution + uTime) - 0.5) * 0.012;

  outColor = vec4(col, 1.0);
}`;

/**
 * Bodies.
 *
 * One instanced draw for every mandate on the floor. Instance attributes carry
 * the live contract state; the shader turns them into shape rather than the
 * CPU rebuilding geometry each frame.
 */
export const BODY_VERT = /* glsl */ `#version 300 es
precision highp float;

layout(location = 0) in vec2  aCorner;    // unit quad
layout(location = 1) in vec2  aPosition;  // clip-space centre
layout(location = 2) in float aRadius;    // capital under mandate
layout(location = 3) in float aBond;      // 0..1 of bond remaining
layout(location = 4) in float aAlpha;     // -1..1 recent performance
layout(location = 5) in float aStrikes;   // 0..1 distress
layout(location = 6) in float aFlash;     // 1 on settlement, decays
layout(location = 7) in float aRupture;   // 1 on dismissal, decays

out vec2  vLocal;
out float vBond;
out float vAlpha;
out float vStrikes;
out float vFlash;
out float vRadius;
out float vRupture;

uniform vec2  uResolution;
uniform float uTime;

void main() {
  vLocal   = aCorner;
  vRupture = aRupture;
  vBond    = aBond;
  vAlpha   = aAlpha;
  vStrikes = aStrikes;
  vFlash   = aFlash;
  vRadius  = aRadius;

  // Distress makes a body tremble. Three strikes and it is visibly shaking
  // before it is dismissed, so the firing is anticipated rather than abrupt.
  float tremor = aStrikes * 0.006;
  vec2 shake = vec2(
    sin(uTime * 27.0 + aPosition.x * 40.0),
    cos(uTime * 31.0 + aPosition.y * 40.0)
  ) * tremor;

  // A dismissal throws the body outward before it settles back, and the quad
  // has to grow to contain the shockwave or it clips at the old radius.
  float burst = 1.0 + aRupture * 1.9;
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 scaled = aCorner * aRadius * burst * vec2(1.0 / aspect, 1.0);
  gl_Position = vec4(aPosition + scaled + shake, 0.0, 1.0);
}`;

export const BODY_FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec2  vLocal;
in float vBond;
in float vAlpha;
in float vStrikes;
in float vFlash;
in float vRadius;
in float vRupture;

out vec4 outColor;

uniform vec3  uInk;
uniform vec3  uGold;
uniform vec3  uGround;
uniform float uTime;

void main() {
  float d = length(vLocal);
  if (d > 1.0) discard;

  // The quad is inflated during a rupture; rescale so the body keeps its true
  // size while the shockwave uses the extra room.
  float burst = 1.0 + vRupture * 1.9;
  float bd = d * burst;

  // Core: capital under mandate.
  float core = smoothstep(0.66, 0.34, bd) * 0.85;
  // Bond ring: how much of the agent's own capital is still at risk. It
  // retreats as the bond is slashed, so a slashed agent is visibly thinner.
  float ringR = 0.68 + vBond * 0.24;
  float ring = smoothstep(0.035, 0.0, abs(bd - ringR)) * vBond;
  // Halo.
  float halo = smoothstep(1.0, 0.55, bd) * 0.20;

  vec3 col = mix(uGround, uInk, 0.85);
  col = mix(col, uInk * 0.92, core);

  // Performance tints the core: gold when beating the benchmark, drained when
  // trailing it. No red anywhere — losing is rendered as absence of light.
  float win = max(vAlpha, 0.0);
  float lose = max(-vAlpha, 0.0);
  col = mix(col, uGold, win * core * 0.55);
  col = mix(col, uGround * 1.2, lose * core * 0.55);

  col += uGold * ring * (0.75 + 0.35 * win);
  col += uInk * halo * 0.55;

  // Settlement flash.
  col += uGold * vFlash * smoothstep(1.0, 0.2, bd) * 0.45;

  // Distress: the rim frays.
  float fray = vStrikes * 0.5 * (0.5 + 0.5 * sin(uTime * 18.0 + bd * 30.0));
  float edge = smoothstep(1.0, 0.92, bd);
  col = mix(col, uGround, edge * fray);

  // Dismissal. The bond ring is what breaks: it detaches and travels outward
  // as a shockwave while the core collapses, because what an agent loses when
  // it is fired is precisely the capital it had staked.
  float shock = 0.0;
  if (vRupture > 0.0) {
    float front = (1.0 - vRupture) * 1.75 + 0.2;
    shock = smoothstep(0.16, 0.0, abs(d - front)) * vRupture;
    col += uGold * shock * 1.4;
    col = mix(col, uGround, vRupture * smoothstep(0.5, 0.0, bd) * 0.55);
  }

  float a = clamp(core + ring + halo + vFlash * 0.4 + shock, 0.0, 1.0);
  outColor = vec4(col, a);
}`;
