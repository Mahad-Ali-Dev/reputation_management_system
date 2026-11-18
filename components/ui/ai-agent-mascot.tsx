"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Frogurt, a little 3D frog mascot with a status pill.
 * (Integrated from 21st.dev; used by the Ask Repulabs assistant.)
 *
 * He is a real mesh, matte and soft-touch, lit by a studio environment in
 * three.js. His shape is a distance field (a body, two eye domes, a flat
 * seat) meshed once in code by shooting a ray from his middle through every
 * vertex of a fine sphere; its normals come from the field, so he is smooth
 * all over. No model file, no image.
 *
 * - idle: breathes, blinks, looks around
 * - thinking: squints up and away while thought bubbles rise
 * - working: puts his glasses on and follows a fly buzzing round his head
 * - done: one happy hop, then a swarm of little flies circles him
 * - limit: startled, eyes wide, goes pale, shakes and sweats
 *
 * Under him a big liquid-glass pill names him and opens to say what he is
 * doing. He pauses off screen and stands still under reduced motion.
 */

export type FrogMascotState = "idle" | "thinking" | "working" | "done" | "limit";

export const FROG_MASCOT_STATES: readonly { id: FrogMascotState; label: string }[] = [
  { id: "idle", label: "Idle" },
  { id: "thinking", label: "Thinking" },
  { id: "working", label: "Working" },
  { id: "done", label: "Done" },
  { id: "limit", label: "At limit" },
];

const DEFAULT_STATUS: Record<FrogMascotState, string | null> = {
  idle: null,
  thinking: "Thinking…",
  working: "Working…",
  done: null,
  limit: null,
};

interface FrogOptions {
  state: FrogMascotState;
  animate: boolean;
  followPointer: boolean;
}

interface FrogHandle {
  update(options: Partial<FrogOptions>): void;
  resize(): void;
  destroy(): void;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------- shape

const smin = (a: number, b: number, k: number) => {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return b * (1 - h) + a * h - k * h * (1 - h);
};
const smax = (a: number, b: number, k: number) => -smin(-a, -b, k);
const ellipsoid = (x: number, y: number, z: number, rx: number, ry: number, rz: number) => {
  const k0 = Math.hypot(x / rx, y / ry, z / rz);
  const k1 = Math.hypot(x / (rx * rx), y / (ry * ry), z / (rz * rz));
  return (k0 * (k0 - 1)) / Math.max(k1, 1e-6);
};

/** Where his eye domes sit. */
const DOME = { x: 0.47, y: 0.6, z: 0.2, r: 0.37 };
/** His seat: the flat he sits on. */
const SEAT = -0.6;

function field(x: number, y: number, z: number) {
  let d = ellipsoid(x, y, z, 1.0, 0.8, 0.86);
  d = smin(d, Math.hypot(x - DOME.x, y - DOME.y, z - DOME.z) - DOME.r, 0.24);
  d = smin(d, Math.hypot(x + DOME.x, y - DOME.y, z - DOME.z) - DOME.r, 0.24);
  return smax(d, -(y - SEAT), 0.2);
}

function normalAt(x: number, y: number, z: number) {
  const e = 0.002;
  return new THREE.Vector3(
    field(x + e, y, z) - field(x - e, y, z),
    field(x, y + e, z) - field(x, y - e, z),
    field(x, y, z + e) - field(x, y, z - e),
  ).normalize();
}

/** The first point on his surface along a ray, from outside. */
function hit(origin: THREE.Vector3, dir: THREE.Vector3) {
  let t = 0;
  for (let i = 0; i < 200; i++) {
    const p = origin.clone().addScaledVector(dir, t);
    const d = field(p.x, p.y, p.z);
    if (d < 1e-4) return p;
    t += d * 0.8;
  }
  return origin.clone();
}

interface Shared {
  body: THREE.BufferGeometry;
  eye: THREE.BufferGeometry;
  happy: THREE.BufferGeometry;
  lensRim: THREE.BufferGeometry;
  lens: THREE.BufferGeometry;
  temple: THREE.BufferGeometry;
  sphere: THREE.BufferGeometry;
  drop: THREE.BufferGeometry;
  /** Each eye's seat on his dome: where, and facing which way. */
  eyes: { position: THREE.Vector3; normal: THREE.Vector3 }[];
  shadow: THREE.Texture;
}

/** Built once and shared by every frog on the page. */
let shared: Shared | null = null;

function build(): Shared {
  const top = new THREE.Color("#c9c3ff");
  const mid = new THREE.Color("#7466ff");
  const low = new THREE.Color("#3a2be0");

  // Body: a fine sphere, each vertex pushed out along its ray to his surface.
  const centre = new THREE.Vector3(0, 0.1, 0);
  const body = new THREE.SphereGeometry(1, 128, 96);
  const pos = body.attributes.position as THREE.BufferAttribute;
  const nor = body.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const dir = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    dir.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
    let lo = 0.02;
    let hi = 2.2;
    for (let k = 0; k < 28; k++) {
      const m = (lo + hi) / 2;
      const p = centre.clone().addScaledVector(dir, m);
      if (field(p.x, p.y, p.z) < 0) lo = m;
      else hi = m;
    }
    const p = centre.clone().addScaledVector(dir, (lo + hi) / 2);
    pos.setXYZ(i, p.x, p.y, p.z);
    const n = normalAt(p.x, p.y, p.z);
    nor.setXYZ(i, n.x, n.y, n.z);
    // Brand colours: soft lilac on top, ultramarine (#4b3bff family) down his
    // sides, deep indigo under him — matches the dashboard accent.
    const t = clamp((p.y - SEAT) / 1.55, 0, 1);
    if (t > 0.45) c.copy(mid).lerp(top, smooth(0.45, 1, t));
    else c.copy(low).lerp(mid, smooth(0, 0.45, t));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  body.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  body.deleteAttribute("uv");
  body.computeBoundingSphere();

  // An eye: a tall pill, flatter at top and bottom than an oval.
  let eye: THREE.BufferGeometry = new THREE.SphereGeometry(1, 48, 32);
  const ep = eye.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < ep.count; i++) {
    let x = ep.getX(i);
    let y = ep.getY(i);
    const r = Math.hypot(x, y);
    if (r > 1e-6) {
      const f = (Math.abs(x / r) ** 2.6 + Math.abs(y / r) ** 2.6) ** (-1 / 2.6);
      x *= f;
      y *= f;
    }
    ep.setXYZ(i, x * 0.1, y * 0.175, ep.getZ(i) * 0.058);
  }
  eye.deleteAttribute("uv");
  eye.deleteAttribute("normal");
  eye = mergeVertices(eye);
  eye.computeVertexNormals();

  // Happy: the closed eye, arched up.
  const happy = new THREE.TubeGeometry(
    new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-0.09, -0.035, 0.02),
      new THREE.Vector3(0, 0.13, 0.05),
      new THREE.Vector3(0.09, -0.035, 0.02),
    ),
    32,
    0.024,
    10,
    false,
  );

  // Glasses: rounded-square rims, clear lenses, a bridge and the arms.
  const rimPoints: THREE.Vector3[] = [];
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    rimPoints.push(
      new THREE.Vector3(
        0.2 * Math.sign(ca) * Math.abs(ca) ** (2 / 3.4),
        0.18 * Math.sign(sa) * Math.abs(sa) ** (2 / 3.4),
        0,
      ),
    );
  }
  const lensRim = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(rimPoints, true),
    144,
    0.026,
    12,
    true,
  );
  const lens = new THREE.ShapeGeometry(
    new THREE.Shape(rimPoints.map((p) => new THREE.Vector2(p.x, p.y))),
    24,
  );
  const temple = new THREE.TubeGeometry(
    new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.06, 0, -0.25),
      new THREE.Vector3(0.02, -0.04, -0.55),
    ),
    24,
    0.022,
    10,
    false,
  );

  const sphere = new THREE.SphereGeometry(1, 32, 24);

  // A drop of sweat: round below, drawn to a point above.
  const profile: THREE.Vector2[] = [];
  for (let i = 0; i <= 32; i++) {
    const y = -1 + 2.7 * (i / 32);
    const r = y <= 0 ? Math.sqrt(Math.max(0, 1 - y * y)) : Math.max(0, 1 - y / 1.7) ** 1.25;
    profile.push(new THREE.Vector2(r, y));
  }
  const drop = new THREE.LatheGeometry(profile, 32);
  drop.computeVertexNormals();

  // Each eye on the front of its dome, a little out and down from its top.
  const eyes = [1, -1].map((side) => {
    const d = new THREE.Vector3(0.22 * side, -0.05, 1).normalize();
    const domeCentre = new THREE.Vector3(DOME.x * side, DOME.y, DOME.z);
    const p = hit(domeCentre.clone().addScaledVector(d, 1.5), d.clone().negate());
    return { position: p, normal: normalAt(p.x, p.y, p.z) };
  });

  // The shadow under him: a soft round, darker at its middle.
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext("2d");
  if (g) {
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(0,0,0,0.42)");
    grad.addColorStop(0.45, "rgba(0,0,0,0.2)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
  const shadow = new THREE.CanvasTexture(canvas);

  return { body, eye, happy, lensRim, lens, temple, sphere, drop, eyes, shadow };
}

// ---------------------------------------------------------------- motion

interface Pose {
  x: number;
  y: number;
  tilt: number;
  sx: number;
  sy: number;
  yaw: number;
  pitch: number;
  lookX: number;
  lookY: number;
  size: number;
  squint: number;
  happy: number;
  blink: number;
  glasses: number;
  think: number;
  fly: number;
  swarm: number;
  sweat: number;
  gloom: number;
}

const rest = (): Pose => ({
  x: 0,
  y: 0,
  tilt: 0,
  sx: 1,
  sy: 1,
  yaw: 0,
  pitch: 0,
  lookX: 0,
  lookY: 0,
  size: 1,
  squint: 0,
  happy: 0,
  blink: 0,
  glasses: 0,
  think: 0,
  fly: 0,
  swarm: 0,
  sweat: 0,
  gloom: 0,
});

/** Each state's face and props, before any motion. */
function dress(pose: Pose, state: FrogMascotState) {
  switch (state) {
    case "thinking":
      Object.assign(pose, { lookX: 0.022, lookY: 0.026, squint: 1, think: 1 });
      break;
    case "working":
      Object.assign(pose, { glasses: 1, fly: 1, size: 0.92 });
      break;
    case "done":
      Object.assign(pose, { happy: 1, swarm: 1 });
      break;
    case "limit":
      // Startled: eyes wide, gone pale, sweating.
      Object.assign(pose, { size: 1.32, sweat: 1, gloom: 1, lookY: 0.006 });
      break;
  }
}

const EXACT: (keyof Pose)[] = ["x", "y", "tilt", "sx", "sy", "blink"];

/** The working fly: a loose orbit round his head, behind it and back. */
const flyPath = (t: number, out: THREE.Vector3) => {
  const a = t * 1.35;
  return out.set(
    1.12 * Math.sin(a) + 0.03 * Math.sin(t * 13),
    1.06 + 0.12 * Math.sin(t * 2.7) + 0.03 * Math.cos(t * 17),
    0.15 + 0.72 * Math.cos(a),
  );
};

/** Done's flies: a happy swarm circling him, each on its own ring. */
const swarmPath = (t: number, i: number, out: THREE.Vector3) => {
  const a = t * (1.6 + i * 0.17) + (i * Math.PI * 2) / 5;
  const r = 1.12 + 0.1 * Math.sin(i * 1.7);
  return out.set(
    r * Math.sin(a),
    1.12 + 0.22 * Math.sin(i * 2.1) + 0.08 * Math.sin(t * 4 + i),
    0.05 + 0.6 * Math.cos(a),
  );
};

// ---------------------------------------------------------------- mount

function mountFrog(canvas: HTMLCanvasElement, initial: FrogOptions): FrogHandle | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "low-power",
    });
  } catch {
    return null;
  }
  shared ??= build();
  const S = shared;
  const options = { ...initial };

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = environment;
  scene.environmentIntensity = 0.85;

  const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 50);
  camera.position.set(0, 0.6, 6.6);
  camera.lookAt(0, 0.32, 0);

  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(-2.2, 3.2, 4);
  const rim = new THREE.DirectionalLight(0xe6e2ff, 1.6);
  rim.position.set(2.5, 1.5, -3);
  const fill = new THREE.HemisphereLight(0xffffff, 0x241a8a, 0.35);
  scene.add(key, rim, fill);

  // Materials: his own, so each frog can go pale on his own.
  const skin = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    // Matte, soft-touch: a rough surface with a velvet sheen at its edges
    // and only a faint, wide coat, so it reads as premium, not plastic.
    roughness: 0.68,
    clearcoat: 0.12,
    clearcoatRoughness: 0.6,
    sheen: 0.9,
    sheenColor: new THREE.Color("#e4e0ff"),
    sheenRoughness: 0.75,
  });
  const ink = new THREE.MeshPhysicalMaterial({
    color: "#0a0c09",
    roughness: 0.12,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
  });
  const frame = new THREE.MeshPhysicalMaterial({
    color: "#121314",
    roughness: 0.22,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    transparent: true,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: "#ffffff",
    roughness: 0.04,
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const pearl = new THREE.MeshPhysicalMaterial({
    color: "#ffffff",
    roughness: 0.25,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    sheen: 0.4,
  });
  const water = new THREE.MeshPhysicalMaterial({
    color: "#bfe6ff",
    roughness: 0.05,
    clearcoat: 1,
    transparent: true,
    opacity: 0.92,
  });
  const wing = new THREE.MeshPhysicalMaterial({
    color: "#ffffff",
    roughness: 0.1,
    clearcoat: 1,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  const bug = new THREE.MeshPhysicalMaterial({
    color: "#20242b",
    roughness: 0.25,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
  });
  const shade = new THREE.MeshBasicMaterial({
    map: S.shadow,
    transparent: true,
    depthWrite: false,
  });

  // The scene: the frog sits on a pivot at his seat, so he squashes from it.
  const root = new THREE.Group();
  scene.add(root);
  const shadowPlane = new THREE.PlaneGeometry(2.6, 2.6);
  const shadow = new THREE.Mesh(shadowPlane, shade);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = SEAT - 0.005;
  root.add(shadow);

  const pivot = new THREE.Group();
  root.add(pivot);
  const frog = new THREE.Group();
  frog.position.y = -SEAT;
  pivot.add(frog);
  frog.add(new THREE.Mesh(S.body, skin));

  const eyes = S.eyes.map((seat, i) => {
    const anchor = new THREE.Group();
    anchor.position.copy(seat.position).addScaledVector(seat.normal, -0.018);
    anchor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), seat.normal);
    // Each leans out a touch at the top.
    anchor.rotateZ(i === 0 ? -0.05 : 0.05);
    const ball = new THREE.Mesh(S.eye, ink);
    const happy = new THREE.Mesh(S.happy, ink);
    anchor.add(ball, happy);
    frog.add(anchor);
    return { ball, happy };
  });

  const glasses = new THREE.Group();
  frog.add(glasses);
  const lenses = S.eyes.map((seat, i) => {
    const lensGroup = new THREE.Group();
    lensGroup.position.copy(seat.position).addScaledVector(seat.normal, 0.11);
    lensGroup.position.y += 0.01;
    const facing = new THREE.Vector3(seat.normal.x * 0.45, seat.normal.y * 0.25, 1).normalize();
    lensGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), facing);
    lensGroup.add(new THREE.Mesh(S.lensRim, frame), new THREE.Mesh(S.lens, glass));
    const temple = new THREE.Mesh(S.temple, frame);
    temple.position.set(i === 0 ? 0.2 : -0.2, 0.02, 0);
    temple.scale.x = i === 0 ? 1 : -1;
    lensGroup.add(temple);
    glasses.add(lensGroup);
    return lensGroup;
  });
  // The bridge, built to the gap between the lenses: an arch over the dip
  // between his domes.
  const [lensL, lensR] = lenses as [THREE.Group, THREE.Group];
  const inner = (lens: THREE.Group, side: number) =>
    new THREE.Vector3(side * 0.2, 0.01, 0).applyQuaternion(lens.quaternion).add(lens.position);
  const a = inner(lensR, 1);
  const b = inner(lensL, -1);
  const bridgeGeometry = new THREE.TubeGeometry(
    new THREE.QuadraticBezierCurve3(
      a,
      new THREE.Vector3(0, Math.max(a.y, b.y) + 0.07, Math.max(a.z, b.z) + 0.04),
      b,
    ),
    32,
    0.024,
    10,
    false,
  );
  glasses.add(new THREE.Mesh(bridgeGeometry, frame));

  // Thought bubbles, up and to his right: two small, then a little cloud
  // with three dots in it.
  const bubbles = [0, 1, 2].map(() => new THREE.Group());
  const BUBBLE_AT = [
    [0.78, 0.98, 0.35],
    [0.93, 1.16, 0.3],
    [1.0, 1.38, 0.15],
  ] as const;
  const ball = (
    group: THREE.Group,
    x: number,
    y: number,
    z: number,
    r: number,
    m: THREE.Material,
  ) => {
    const mesh = new THREE.Mesh(S.sphere, m);
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(r);
    group.add(mesh);
    return mesh;
  };
  const [b0, b1, b2] = bubbles as [THREE.Group, THREE.Group, THREE.Group];
  ball(b0, 0, 0, 0, 0.05, pearl);
  ball(b1, 0, 0, 0, 0.08, pearl);
  ball(b2, 0, 0, 0, 0.17, pearl);
  ball(b2, -0.15, -0.05, -0.01, 0.12, pearl);
  ball(b2, 0.15, -0.04, -0.01, 0.12, pearl);
  ball(b2, 0.03, 0.1, -0.03, 0.12, pearl);
  const dots = [-0.075, 0, 0.075].map((x) => ball(b2, x, -0.01, 0.17, 0.027, ink));
  bubbles.forEach((g, i) => {
    const [x, y, z] = BUBBLE_AT[i] ?? [0, 0, 0];
    g.position.set(x, y, z);
  });
  root.add(...bubbles);

  // Flies: one while he works, a swarm when he is done.
  const flies = [0, 1, 2, 3, 4].map(() => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(S.sphere, bug);
    body.scale.set(0.05, 0.042, 0.065);
    const head = new THREE.Mesh(S.sphere, bug);
    head.scale.setScalar(0.032);
    head.position.z = 0.065;
    const left = new THREE.Mesh(S.sphere, wing);
    const right = new THREE.Mesh(S.sphere, wing);
    left.scale.set(0.075, 0.006, 0.04);
    left.position.set(0.055, 0.042, -0.015);
    right.scale.set(0.075, 0.006, 0.04);
    right.position.set(-0.055, 0.042, -0.015);
    g.add(body, head, left, right);
    g.visible = false;
    root.add(g);
    return { group: g, left, right, last: new THREE.Vector3() };
  });

  const sweat = new THREE.Mesh(S.drop, water);
  sweat.visible = false;
  frog.add(sweat);

  // ------------------------------------------------------------ animation

  const motion =
    typeof matchMedia === "undefined" ? null : matchMedia("(prefers-reduced-motion: reduce)");
  const start = performance.now() / 1000;
  let last = start;
  let raf = 0;
  let visible = true;
  let stateSince = 0;
  let lastState = options.state;
  let pose = rest();
  dress(pose, options.state);
  let from: Pose | null = null;
  let blendAt = 0;
  let blinkAt = 1 + Math.random() * 2;
  let gaze = { x: 0, y: 0, at: 0 };
  const aim = { eyeX: 0, eyeY: 0, headX: 0, headY: 0 };
  let pointer: { x: number; y: number } | null = null;
  // Reused every frame, so a frame allocates nothing.
  const fly = flyPath(0, new THREE.Vector3());
  const swarmAt = new THREE.Vector3();
  const heading = new THREE.Vector3();
  let lastDraw = 0;
  const grey = new THREE.Color("#cbc9d8");
  const white = new THREE.Color("#ffffff");

  const target = (t: number): Pose => {
    const state = options.state;
    const since = t - stateSince;
    const p = rest();
    dress(p, state);
    const breath = Math.sin(t * 1.6);
    const calm = state === "idle" || (state === "done" && since > 1.2);

    if (calm) {
      if (options.followPointer && pointer) {
        p.lookX = aim.eyeX * 0.026;
        p.lookY = aim.eyeY * 0.02;
      } else {
        if (t > gaze.at)
          gaze = {
            x: (Math.random() - 0.5) * 0.036,
            y: (Math.random() - 0.5) * 0.022,
            at: t + 1.6 + Math.random() * 2.6,
          };
        p.lookX = gaze.x;
        p.lookY = gaze.y;
      }
      p.y = 0.03 * Math.max(0, Math.sin(t * 1.1));
      p.sy = 1 + 0.02 * breath;
      p.sx = 1 - 0.012 * breath;
      p.tilt = 0.02 * Math.sin(t * 0.7);
      p.yaw = 0.06 * Math.sin(t * 0.45);
      if (state === "done") {
        // Eyes open again after the hop, and the flies leave.
        const open = since >= 3;
        p.happy = open ? 0 : 1;
        p.swarm = open ? 0 : 1;
      }
    } else if (state === "thinking") {
      p.lookX += 0.004 * Math.sin(t * 0.9);
      p.tilt = 0.06 + 0.015 * Math.sin(t * 0.8);
      p.yaw = 0.18;
      p.pitch = -0.08;
      p.sy = 1 + 0.014 * breath;
    } else if (state === "working") {
      // Eyes on the fly, the head turning after it.
      const dx = clamp(fly.x / 1.12, -1, 1);
      p.lookX = dx * 0.03 * (fly.z < 0 ? 0.5 : 1);
      p.lookY = 0.022;
      p.yaw = dx * 0.32;
      p.pitch = -0.1;
      p.tilt = -dx * 0.04;
      p.sy = 1 + 0.015 * breath;
    } else if (state === "done") {
      // One hop: crouch, up, land with a squash.
      const u = since / 1.2;
      if (u < 0.15) {
        const s = Math.sin((u / 0.15) * Math.PI);
        p.sy = 1 - 0.13 * s;
        p.sx = 1 + 0.1 * s;
      } else if (u < 0.72) {
        const v = (u - 0.15) / 0.57;
        p.y = 0.48 * 4 * v * (1 - v);
        p.sy = 1 + 0.08 * Math.sin(v * Math.PI);
        p.sx = 1 - 0.05 * Math.sin(v * Math.PI);
      } else if (u < 0.9) {
        const s = Math.sin(((u - 0.72) / 0.18) * Math.PI);
        p.sy = 1 - 0.11 * s;
        p.sx = 1 + 0.09 * s;
      }
      p.tilt = -0.07 * Math.sin(u * Math.PI * 2);
    } else if (state === "limit") {
      const u = since % 2.2;
      const shake = u < 0.6 ? 1 - u / 0.6 : 0;
      p.x = 0.04 * Math.sin(u * 38) * shake;
      p.sx = 1.01;
      p.sy = 0.96;
      p.pitch = 0.04;
    }

    // The head turns after the eyes.
    p.x += aim.headX * 0.05;
    p.yaw += aim.headX * 0.4;
    p.pitch -= aim.headY * 0.22;

    if (t > blinkAt + 0.15) blinkAt = t + (state === "limit" ? 6 : 3.5) + Math.random() * 3.5;
    const bl = (t - blinkAt) / 0.15;
    if (bl >= 0 && bl <= 1 && p.happy < 0.5) p.blink = bl < 0.4 ? bl / 0.4 : 1 - (bl - 0.4) / 0.6;
    return p;
  };

  const step = (t: number, dt: number) => {
    if (options.state !== lastState) {
      from = { ...pose };
      blendAt = t;
      stateSince = t;
      lastState = options.state;
    }
    const pt = options.followPointer ? pointer : null;
    const ke = 1 - Math.exp(-dt * 12);
    const kh = 1 - Math.exp(-dt * 5);
    aim.eyeX += ((pt?.x ?? 0) - aim.eyeX) * ke;
    aim.eyeY += ((pt?.y ?? 0) - aim.eyeY) * ke;
    aim.headX += ((pt?.x ?? 0) - aim.headX) * kh;
    aim.headY += ((pt?.y ?? 0) - aim.headY) * kh;
    flyPath(t, fly);
    const goal = target(t);
    const s = from ? Math.min(1, (t - blendAt) / 0.4) : 1;
    const blend = s * s * s * (s * (s * 6 - 15) + 10);
    const prev = from;
    if (s >= 1) from = null;
    const ease = 1 - Math.exp(-dt * 10);
    for (const k of Object.keys(goal) as (keyof Pose)[]) {
      if (prev && s < 1 && EXACT.includes(k) && k !== "blink")
        pose[k] = prev[k] + (goal[k] - prev[k]) * blend;
      else pose[k] = EXACT.includes(k) ? goal[k] : pose[k] + (goal[k] - pose[k]) * ease;
    }
  };

  const place = (t: number) => {
    const p = pose;
    pivot.position.set(p.x, SEAT + p.y, 0);
    pivot.rotation.set(p.pitch, p.yaw, p.tilt);
    pivot.scale.set(p.sx, p.sy, p.sx);
    const lift = clamp(p.y / 0.48, 0, 1);
    shadow.position.x = p.x;
    shadow.scale.setScalar(1 - lift * 0.4);
    shade.opacity = 1 - lift * 0.65;

    skin.color.copy(white).lerp(grey, p.gloom * 0.8);
    skin.sheen = 0.9 * (1 - p.gloom * 0.6);

    for (const eye of eyes) {
      const squash = (1 - 0.9 * p.blink) * (1 - 0.56 * p.squint);
      const widen = 1 + 0.08 * p.blink + 0.1 * p.squint;
      const open = 1 - p.happy;
      eye.ball.visible = open > 0.02;
      eye.ball.scale.set(p.size * widen, Math.max(0.001, p.size * squash * open), 1);
      eye.ball.position.set(p.lookX, p.lookY - 0.03 * p.squint, 0);
      eye.happy.visible = p.happy > 0.02;
      eye.happy.scale.setScalar(Math.max(0.001, p.happy));
      eye.happy.position.set(p.lookX * 0.5, 0, 0);
    }

    glasses.visible = p.glasses > 0.01;
    glasses.position.y = (1 - p.glasses) * 0.35;
    frame.opacity = clamp(p.glasses * 1.5, 0, 1);
    glass.opacity = 0.14 * p.glasses;

    const life = (t / 2.6) % 1;
    bubbles.forEach((g, i) => {
      const at = BUBBLE_AT[i] ?? [0, 0, 0];
      const show =
        smooth(0.04 + i * 0.12, 0.14 + i * 0.12, life) * (1 - smooth(0.9, 0.98, life)) * p.think;
      g.visible = show > 0.01;
      g.scale.setScalar(Math.max(0.001, 0.5 + 0.5 * show) * Math.min(1, show * 3));
      g.position.x = at[0] + p.x * 0.6;
      g.position.y = at[1] + 0.02 * Math.sin(t * 2 + i);
    });
    dots.forEach((d, j) => {
      d.position.y = -0.01 + 0.03 * Math.max(Math.sin(t * 7 - j * 0.9), 0);
    });

    flies.forEach((f, i) => {
      const working = i === 0 ? p.fly : 0;
      const pop = clamp(p.swarm * 1.4 - i * 0.08, 0, 1);
      const amount = Math.max(working, pop);
      f.group.visible = amount > 0.02;
      if (!f.group.visible) return;
      // Swarm flies arrive from out wide and leave the same way.
      const at = working >= pop ? fly : swarmPath(t, i, swarmAt);
      if (working < pop) {
        const away = 1 - p.swarm;
        at.x *= 1 + away * 1.4;
        at.z *= 1 + away * 1.4;
        at.y += away * 0.7;
      }
      f.group.position.copy(at);
      f.group.position.x += p.x;
      f.group.scale.setScalar(amount);
      // Facing where it is going.
      heading.subVectors(at, f.last);
      if (heading.lengthSq() > 1e-8) f.group.rotation.y = Math.atan2(heading.x, heading.z);
      f.last.copy(at);
      const flap = Math.sin(t * 70 + i) * 0.6;
      f.left.rotation.z = flap;
      f.right.rotation.z = -flap;
    });

    const slide = (t * 0.45) % 1;
    sweat.visible = p.sweat > 0.02;
    sweat.position.set(0.84, 0.9 - slide * 0.14, 0.32);
    sweat.scale.setScalar(
      0.085 * p.sweat * smooth(0, 0.12, slide) * (1 - smooth(0.8, 1, slide)) + 0.0001,
    );
  };

  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w && h) renderer.setSize(w, h, false);
  };
  resize();

  const moving = () => options.animate && !motion?.matches;

  const tick = (now: number) => {
    raf = 0;
    if (!visible) return;
    const t = now / 1000 - start;
    if (!moving()) {
      // Still: the state's face and props, at a moment where all show.
      pose = rest();
      dress(pose, options.state);
      flyPath(0.6, fly);
      place(1.1);
      renderer.render(scene, camera);
      return;
    }
    // At rest (breathing, blinking, looking round) 30 frames a second read
    // the same as 60 and cost half: the rest of the time, 60.
    const since = t - stateSince;
    const calm =
      !pointer &&
      !from &&
      (options.state === "idle" ||
        (options.state === "done" && since > 4) ||
        options.state === "thinking");
    if (now - lastDraw < (calm ? 1000 / 30 : 1000 / 60) - 1) {
      raf = requestAnimationFrame(tick);
      return;
    }
    lastDraw = now;
    const dt = Math.min(0.1, Math.max(0, now / 1000 - last));
    last = now / 1000;
    step(t, dt);
    place(t);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  };
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(tick);
  };

  const observer =
    typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver((entries) => {
          visible = !!entries[entries.length - 1]?.isIntersecting;
          if (visible) {
            last = performance.now() / 1000;
            schedule();
          }
        });
  observer?.observe(canvas);

  const onPointer = (event: PointerEvent) => {
    const box = canvas.getBoundingClientRect();
    const x = (event.clientX - (box.left + box.width / 2)) / box.width;
    const y = (box.top + box.height / 2 - event.clientY) / box.height;
    pointer = { x: clamp(x * 1.6, -1, 1), y: clamp(y * 1.6, -1, 1) };
  };
  const onLeave = () => {
    pointer = null;
  };
  const onMotion = () => schedule();
  window.addEventListener("pointermove", onPointer, { passive: true });
  document.documentElement.addEventListener("pointerleave", onLeave);
  motion?.addEventListener("change", onMotion);
  schedule();

  return {
    update(next) {
      Object.assign(options, next);
      last = performance.now() / 1000;
      schedule();
    },
    resize() {
      resize();
      schedule();
    },
    destroy() {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      window.removeEventListener("pointermove", onPointer);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      motion?.removeEventListener("change", onMotion);
      for (const m of [skin, ink, frame, glass, pearl, water, wing, bug, shade]) m.dispose();
      shadowPlane.dispose();
      bridgeGeometry.dispose();
      environment.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };
}

// ---------------------------------------------------------------- component

const PILL_CSS = `
@keyframes frog-mascot-shimmer { 0% { background-position: 100% 50%; } 100% { background-position: -100% 50%; } }
.frog-mascot-shimmer {
  background-image: linear-gradient(to right, #8a8a93 20%, #d4d4d8 50%, #8a8a93 80%);
  background-size: 200% 100%;
  -webkit-background-clip: text; background-clip: text; color: transparent;
  animation: frog-mascot-shimmer 2.4s ease-in-out infinite;
}
/* Liquid glass: clear, not frosted, so what is behind shows through brighter
   and richer; a bright rim that catches light at the top left and bottom
   right, a sheen across the top and a glow along the bottom edge. */
.frog-mascot-pill {
  position: relative;
  isolation: isolate;
  color: #18181b;
  background: linear-gradient(180deg, rgba(255,255,255,0.5), rgba(255,255,255,0.22));
  -webkit-backdrop-filter: blur(6px) saturate(210%) brightness(1.08);
  backdrop-filter: blur(6px) saturate(210%) brightness(1.08);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.95),
    inset 0 -12px 18px -12px rgba(255,255,255,0.75),
    inset 0 8px 14px -10px rgba(0,0,0,0.1),
    0 0 0 0.5px rgba(0,0,0,0.05),
    0 10px 28px rgba(0,0,0,0.12),
    0 2px 5px rgba(0,0,0,0.07);
}
.frog-mascot-pill::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1.5px;
  background: linear-gradient(135deg, rgba(255,255,255,1) 0%, rgba(255,255,255,0.25) 30%, rgba(255,255,255,0.05) 55%, rgba(255,255,255,0.85) 100%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
}
.frog-mascot-pill::after {
  content: "";
  position: absolute;
  inset: 1.5px 5% 50% 5%;
  border-radius: inherit;
  background: radial-gradient(120% 100% at 50% 0%, rgba(255,255,255,0.75), rgba(255,255,255,0) 70%);
  opacity: 0.7;
  pointer-events: none;
  z-index: -1;
}
.frog-mascot-status { color: #6b6b74; }
.frog-mascot-status.frog-mascot-shimmer { color: transparent; }
@media (prefers-reduced-motion: reduce) {
  .frog-mascot-shimmer { animation: none; background: none; color: #71717a; }
}
`;

export interface FrogMascotProps {
  state?: FrogMascotState;
  /** CSS pixels: his box is square, narrower in a smaller container. */
  size?: number;
  /** The name on his pill. */
  name?: string;
  /** Show the pill under him. */
  showTag?: boolean;
  /** What the pill says in each state; null keeps it closed. */
  statusLabels?: Partial<Record<FrogMascotState, string | null>>;
  /** Move on his own. Off, he is drawn still. */
  animate?: boolean;
  /** His eyes and head follow the pointer. */
  followPointer?: boolean;
  className?: string;
}

export function FrogMascot({
  state = "idle",
  size = 240,
  name = "Frogurt",
  showTag = true,
  statusLabels,
  animate = true,
  followPointer = false,
  className = "",
}: FrogMascotProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<FrogHandle | null>(null);
  const [failed, setFailed] = useState(false);

  // Mounted once; later changes go through update() below.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only; props flow through handle.update
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handle = mountFrog(canvas, { state, animate, followPointer });
    if (!handle) {
      setFailed(true);
      return;
    }
    handleRef.current = handle;
    const sizes =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => handle.resize());
    sizes?.observe(canvas);
    return () => {
      sizes?.disconnect();
      handle.destroy();
      handleRef.current = null;
    };
  }, []);

  useEffect(() => {
    handleRef.current?.update({ state, animate, followPointer });
  }, [state, animate, followPointer]);

  // The pill: his name, and under it the state, opening and closing with it.
  // The last words stay while it closes, so it never empties as it goes.
  const labels = { ...DEFAULT_STATUS, ...statusLabels };
  const status = labels[state] ?? null;
  const shownStatus = useRef(status);
  if (status) shownStatus.current = status;
  const shimmer = state === "thinking" || state === "working";
  const font = clamp(size * 0.11, 12, 36);
  const wrap: CSSProperties = { width: size, maxWidth: "100%" };

  return (
    <div className={`inline-flex flex-col items-center ${className}`} style={wrap}>
      <style>{PILL_CSS}</style>
      {failed ? (
        <svg
          viewBox="0 0 200 200"
          role="img"
          aria-label={name}
          style={{ width: "100%", height: "auto" }}
        >
          <title>{name}</title>
          <path
            d="M100 170 C58 170 24 160 24 126 C24 104 33 92 44 85 C38 63 50 40 70 40 C86 40 95 50 100 57 C105 50 114 40 130 40 C150 40 162 63 156 85 C167 92 176 104 176 126 C176 160 142 170 100 170 Z"
            fill="#7466ff"
          />
          <ellipse cx="70" cy="70" rx="8" ry="14" fill="#0a0c09" />
          <ellipse cx="130" cy="70" rx="8" ry="14" fill="#0a0c09" />
        </svg>
      ) : (
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`${name}${status ? `, ${status}` : ""}`}
          style={{ width: "100%", aspectRatio: "1 / 1", display: "block" }}
        />
      )}

      {showTag && (
        <div
          aria-hidden="true"
          className="frog-mascot-pill relative z-10 flex flex-col items-center"
          style={{
            marginTop: -size * 0.16,
            borderRadius: font * 0.62,
            padding: `${font * 0.42}px ${font * 0.85}px`,
            minWidth: font * 4.2,
          }}
        >
          <span
            className="block font-medium"
            style={{ fontSize: font, lineHeight: 1.2, letterSpacing: "-0.01em" }}
          >
            {name}
          </span>
          <div
            className="grid transition-[grid-template-rows,opacity] duration-300 ease-out"
            style={{ gridTemplateRows: status ? "1fr" : "0fr", opacity: status ? 1 : 0 }}
          >
            <div className="overflow-hidden">
              <span
                className={`frog-mascot-status block whitespace-nowrap text-center ${shimmer ? "frog-mascot-shimmer" : ""}`}
                style={{ fontSize: font * 0.84, lineHeight: 1.3, paddingTop: font * 0.12 }}
              >
                {shownStatus.current}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FrogMascot;
