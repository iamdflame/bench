"use client";

/**
 * The floor.
 *
 * WebGL2, two draw calls, no scene library. Every attribute fed to the GPU is
 * live contract state: radius is capital under mandate, the ring is the bond
 * still at risk, tint is realized alpha, tremor is accumulated strikes. When
 * nothing is happening on chain the floor is almost still, which is the point —
 * the motion is not decoration, it is the market.
 */

import { useEffect, useRef } from "react";
import { BODY_FRAG, BODY_VERT, FIELD_FRAG, FIELD_VERT } from "./shaders";

export interface FloorBody {
  id: number;
  /** Clip-space centre, -1..1. */
  x: number;
  y: number;
  /** Clip-space radius. */
  radius: number;
  /** Fraction of the original bond still at risk, 0..1. */
  bond: number;
  /** Recent realized alpha, clamped to -1..1. */
  alpha: number;
  /** Distress, 0..1. */
  strikes: number;
}

export interface FloorState {
  bodies: FloorBody[];
  /** Aggregate loss across the market, 0..1. */
  stress: number;
  /** Aggregate capital in motion, 0..1. */
  flow: number;
  /** Bumped when a settlement lands, to fire the pulse. */
  settlementTick: number;
  /** Mandate ids dismissed since the last frame consumed them. */
  ruptures: number[];
}

const FLOATS_PER_BODY = 8; // x, y, radius, bond, alpha, strikes, flash, rupture
const MAX_BODIES = 256;

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`shader compile failed: ${log}`);
  }
  return shader;
}

function link(gl: WebGL2RenderingContext, vertSrc: string, fragSrc: string) {
  const program = gl.createProgram()!;
  const vert = compile(gl, gl.VERTEX_SHADER, vertSrc);
  const frag = compile(gl, gl.FRAGMENT_SHADER, fragSrc);
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`program link failed: ${gl.getProgramInfoLog(program)}`);
  }
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  return program;
}

const readColor = (name: string, fallback: [number, number, number]) => {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const m = /^#([0-9a-f]{6})$/i.exec(raw);
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255] as [
    number,
    number,
    number,
  ];
};

export default function FloorCanvas({
  state,
  className,
  style,
}: {
  state: React.RefObject<FloorState>;
  className?: string;
  style?: React.CSSProperties;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const failedRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      powerPreference: "high-performance",
      premultipliedAlpha: false,
    });

    if (!gl) {
      // Integrated graphics from before WebGL2, or a blocked context. The page
      // is still fully usable without the floor; it just does not animate.
      failedRef.current = true;
      canvas.style.display = "none";
      return;
    }

    let fieldProgram: WebGLProgram;
    let bodyProgram: WebGLProgram;
    try {
      fieldProgram = link(gl, FIELD_VERT, FIELD_FRAG);
      bodyProgram = link(gl, BODY_VERT, BODY_FRAG);
    } catch (error) {
      console.warn("floor: shader failure, falling back to a still page", error);
      failedRef.current = true;
      canvas.style.display = "none";
      return;
    }

    // Unit quad, shared by both passes.
    const quad = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
    const quadBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

    // ---- field VAO
    const fieldVao = gl.createVertexArray()!;
    gl.bindVertexArray(fieldVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // ---- body VAO, instanced
    const instanceData = new Float32Array(MAX_BODIES * FLOATS_PER_BODY);
    const instanceBuffer = gl.createBuffer()!;
    const bodyVao = gl.createVertexArray()!;
    gl.bindVertexArray(bodyVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, instanceData.byteLength, gl.DYNAMIC_DRAW);
    const stride = FLOATS_PER_BODY * 4;
    // location 1: vec2 position, 2..6: scalars
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(1, 1);
    for (let i = 0; i < 6; i++) {
      const loc = 2 + i;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 1, gl.FLOAT, false, stride, (2 + i) * 4);
      gl.vertexAttribDivisor(loc, 1);
    }
    gl.bindVertexArray(null);

    const u = (p: WebGLProgram, name: string) => gl.getUniformLocation(p, name);
    const fieldU = {
      resolution: u(fieldProgram, "uResolution"),
      time: u(fieldProgram, "uTime"),
      stress: u(fieldProgram, "uStress"),
      flow: u(fieldProgram, "uFlow"),
      ink: u(fieldProgram, "uInk"),
      ground: u(fieldProgram, "uGround"),
      gold: u(fieldProgram, "uGold"),
      pulse: u(fieldProgram, "uPulse"),
    };
    const bodyU = {
      resolution: u(bodyProgram, "uResolution"),
      time: u(bodyProgram, "uTime"),
      ink: u(bodyProgram, "uInk"),
      ground: u(bodyProgram, "uGround"),
      gold: u(bodyProgram, "uGold"),
    };

    let ink = readColor("--ink", [0.9, 0.89, 0.85]);
    let ground = readColor("--void", [0.031, 0.035, 0.043]);
    let gold = readColor("--gold-999", [0.91, 0.64, 0.09]);

    const themeQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const onTheme = () => {
      ink = readColor("--ink", ink);
      ground = readColor("--void", ground);
      gold = readColor("--gold-999", gold);
    };
    themeQuery.addEventListener("change", onTheme);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    const resize = () => {
      // Integrated GPUs choke on a 2x buffer at this fragment cost; 1.5 is the
      // point where the field still looks smooth and the frame budget holds.
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      if (w === width && h === height) return;
      width = w;
      height = h;
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    };
    resize();

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Per-body flash decay lives here rather than in React, so a settlement
    // does not cost a re-render.
    const flash = new Float32Array(MAX_BODIES);
    // Keyed by mandate id, not slot index: bodies reorder as mandates open and
    // close, and a shockwave must stay with the mandate it belongs to.
    const rupture = new Map<number, number>();
    let lastTick = -1;
    let pulse = 0;
    let raf = 0;
    const start = performance.now();
    let previous = start;

    const frame = (now: number) => {
      const dt = Math.min((now - previous) / 1000, 0.1);
      previous = now;
      const t = (now - start) / 1000;
      resize();

      const s = state.current;
      const bodies = s?.bodies ?? [];

      if (s && s.settlementTick !== lastTick) {
        lastTick = s.settlementTick;
        pulse = 1;
        for (let i = 0; i < Math.min(bodies.length, MAX_BODIES); i++) flash[i] = 1;
      }
      if (s?.ruptures.length) {
        for (const id of s.ruptures) rupture.set(id, 1);
        s.ruptures.length = 0;
      }
      pulse = Math.max(0, pulse - dt * 0.7);
      for (let i = 0; i < MAX_BODIES; i++) {
        flash[i] = Math.max(0, flash[i] - dt * 1.6);
      }
      for (const [id, v] of rupture) {
        const next = v - dt * 0.75;
        if (next <= 0) rupture.delete(id);
        else rupture.set(id, next);
      }

      // ---- field
      gl.useProgram(fieldProgram);
      gl.bindVertexArray(fieldVao);
      gl.uniform2f(fieldU.resolution, width, height);
      gl.uniform1f(fieldU.time, reduced ? 0 : t);
      gl.uniform1f(fieldU.stress, s?.stress ?? 0);
      gl.uniform1f(fieldU.flow, s?.flow ?? 0);
      gl.uniform3fv(fieldU.ink, ink);
      gl.uniform3fv(fieldU.ground, ground);
      gl.uniform3fv(fieldU.gold, gold);
      gl.uniform1f(fieldU.pulse, reduced ? 0 : pulse);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      // ---- bodies
      const count = Math.min(bodies.length, MAX_BODIES);
      if (count > 0) {
        for (let i = 0; i < count; i++) {
          const b = bodies[i];
          const o = i * FLOATS_PER_BODY;
          instanceData[o] = b.x;
          instanceData[o + 1] = b.y;
          instanceData[o + 2] = b.radius;
          instanceData[o + 3] = b.bond;
          instanceData[o + 4] = b.alpha;
          instanceData[o + 5] = b.strikes;
          instanceData[o + 6] = flash[i];
          instanceData[o + 7] = rupture.get(b.id) ?? 0;
        }
        gl.useProgram(bodyProgram);
        gl.bindVertexArray(bodyVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
        gl.bufferSubData(
          gl.ARRAY_BUFFER,
          0,
          instanceData.subarray(0, count * FLOATS_PER_BODY),
        );
        gl.uniform2f(bodyU.resolution, width, height);
        gl.uniform1f(bodyU.time, reduced ? 0 : t);
        gl.uniform3fv(bodyU.ink, ink);
        gl.uniform3fv(bodyU.ground, ground);
        gl.uniform3fv(bodyU.gold, gold);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);
      }

      gl.bindVertexArray(null);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      themeQuery.removeEventListener("change", onTheme);
      gl.deleteProgram(fieldProgram);
      gl.deleteProgram(bodyProgram);
      gl.deleteBuffer(quadBuffer);
      gl.deleteBuffer(instanceBuffer);
      gl.deleteVertexArray(fieldVao);
      gl.deleteVertexArray(bodyVao);
    };
  }, [state]);

  return <canvas ref={canvasRef} aria-hidden className={className} style={style} />;
}
