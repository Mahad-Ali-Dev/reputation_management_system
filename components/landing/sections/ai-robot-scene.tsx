"use client";

/**
 * RobotScene — the founder's react-three-fiber robot head (RobotHero library:
 * HeartCurve / ResponsiveGroup / GlassCapsule / RobotEar / RobotEye /
 * RobotPrototype), ported verbatim-in-spirit and recoloured for repulabs:
 *   - glass face-dome fresnel + heart-eyes → cyan #22d3ee
 *   - antenna tips → blue #4a68ff
 *   - lighting retuned for the dark navy section it now lives in
 * Kept exactly: blink timing (0.45s blink on a 3.0s cycle), procedural PBR
 * speckle texture, pointer-follow body/head tracking, click → heart-eyes.
 * Added: a gentle idle float (sinusoidal bob) so the robot never sits still.
 *
 * This file is ONLY ever loaded through `next/dynamic(..., { ssr: false })`
 * from ai-robot.tsx so three.js stays out of SSR and the main bundle.
 */

import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer } from "@react-three/drei";
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";

/* ── brand accents ── */
const CYAN = "#22d3ee";
const BLUE = "#4a68ff";

/* ─────────────────────────── HeartCurve ─────────────────────────── */

class HeartCurve extends THREE.Curve<THREE.Vector3> {
  // biome-ignore lint/complexity/noUselessConstructor: widens the protected Curve constructor to public
  constructor() {
    super();
  }
  getPoint(t: number, optionalTarget = new THREE.Vector3()) {
    t = t * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    return optionalTarget.set(x * 0.002, (y + 6) * 0.002, 0);
  }
}

const sharedHeartCurve = new HeartCurve();

/* ─────────────────────────── ResponsiveGroup ─────────────────────────── */

function ResponsiveGroup({ children }: { children: ReactNode }) {
  const { viewport } = useThree();
  /* original: min(1.1, width/3.5) — retuned so the robot fills the ~560px
     column canvas instead of a full-viewport hero. */
  const scale = Math.min(1.78, viewport.width / 2.05);
  return <group scale={scale}>{children}</group>;
}

/* ─────────────────────────── GlassCapsule ─────────────────────────── */

function GlassCapsule({
  color,
  power,
  intensity,
}: {
  color: string;
  power: number;
  intensity: number;
}) {
  const uniforms = useMemo(
    () => ({
      color: { value: new THREE.Color("#ffffff") },
      power: { value: 2.5 },
      intensity: { value: 0.6 },
    }),
    [],
  );

  /* the material holds this exact uniforms object by reference */
  useFrame(() => {
    uniforms.color.value.set(color);
    uniforms.power.value = power;
    uniforms.intensity.value = intensity;
  });

  return (
    <mesh>
      <sphereGeometry args={[0.3, 64, 64, 0, Math.PI * 2, 0, Math.PI]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={`
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            vViewPosition = -mvPosition.xyz;
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * mvPosition;
          }
        `}
        fragmentShader={`
          uniform vec3 color;
          uniform float power;
          uniform float intensity;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 normal = normalize(vNormal);
            vec3 viewDir = normalize(vViewPosition);
            float fresnel = 1.0 - max(dot(viewDir, normal), 0.0);
            fresnel = pow(fresnel, power);
            gl_FragColor = vec4(color, fresnel * intensity);
          }
        `}
        transparent={true}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

/* ─────────────────────────── RobotEar ─────────────────────────── */

const earBaseMat = new THREE.MeshStandardMaterial({ color: "#f0f0f0", roughness: 0.5 });
const earRingMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.3 });
const earCenterMat = new THREE.MeshStandardMaterial({ color: "#cccccc", roughness: 0.8 });
const antennaBaseMat = new THREE.MeshStandardMaterial({
  color: "#999999",
  roughness: 0.4,
  metalness: 0.5,
});
const antennaStickMat = new THREE.MeshStandardMaterial({
  color: "#d0d0d0",
  roughness: 0.4,
  metalness: 0.2,
});
/* original tip was #ff3366 — recoloured to the repulabs blue accent */
const antennaTipMat = new THREE.MeshBasicMaterial({ color: BLUE, toneMapped: false });

function RobotEar({
  position,
  scale = 1,
  isLeft = false,
}: {
  position: [number, number, number];
  scale?: number;
  isLeft?: boolean;
}) {
  const dir = isLeft ? -1 : 1;

  return (
    <group position={position} scale={scale}>
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow material={earBaseMat}>
        <cylinderGeometry args={[0.04, 0.04, 0.025, 32]} />
      </mesh>

      <mesh
        position={[dir * 0.012, 0, 0]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
        receiveShadow
        material={earRingMat}
      >
        <torusGeometry args={[0.032, 0.008, 16, 32]} />
      </mesh>

      <mesh
        position={[dir * 0.012, 0, 0]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
        receiveShadow
        material={earCenterMat}
      >
        <cylinderGeometry args={[0.03, 0.03, 0.005, 32]} />
      </mesh>

      <group position={[dir * 0.015, 0.035, 0]} rotation={[-0.4, 0, 0]}>
        <mesh position={[0, 0.01, 0]} castShadow receiveShadow material={antennaBaseMat}>
          <cylinderGeometry args={[0.006, 0.008, 0.02, 16]} />
        </mesh>
        <mesh position={[0, 0.06, 0]} castShadow receiveShadow material={antennaStickMat}>
          <cylinderGeometry args={[0.003, 0.003, 0.1, 8]} />
        </mesh>
        <mesh position={[0, 0.11, 0]} material={antennaTipMat}>
          <sphereGeometry args={[0.008, 16, 16]} />
        </mesh>
      </group>
    </group>
  );
}

/* ─────────────────────────── RobotEye ─────────────────────────── */

const eyeMat = new THREE.MeshBasicMaterial({
  color: new THREE.Color(2, 2, 2),
  toneMapped: false,
  transparent: true,
});
/* heart-eyes recoloured from #ff3366 to the screen cyan */
const heartMat = new THREE.MeshBasicMaterial({ color: CYAN, toneMapped: false });

function RobotEye({
  position,
  rotation,
  scale = 1,
  blinkDuration = 0.15,
  blinkCycle = 3.0,
  isLovedRef,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  scale?: number;
  blinkDuration?: number;
  blinkCycle?: number;
  isLovedRef: { current: boolean };
}) {
  const groupRef = useRef<THREE.Group>(null);
  const normalEyesRef = useRef<THREE.Group>(null);
  const heartEyeRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!groupRef.current || !normalEyesRef.current || !heartEyeRef.current) return;

    const isHeart = isLovedRef.current;

    normalEyesRef.current.visible = !isHeart;
    heartEyeRef.current.visible = isHeart;

    const cycle = clock.getElapsedTime() % blinkCycle;

    let targetScaleY = 1;

    if (cycle < blinkDuration && !isHeart) {
      const progress = cycle / blinkDuration;
      const blinkClose = Math.sin(progress * Math.PI);
      targetScaleY = Math.max(0.05, 1.0 - blinkClose);
    }

    groupRef.current.scale.set(scale, scale * targetScaleY, scale);
  });

  const { topPath, bottomPath } = useMemo(() => {
    const w = 0.025;
    const h = 0.035;
    const r = 0.02;
    const g = 0.005;

    const tPath = new THREE.CurvePath<THREE.Vector3>();
    tPath.add(new THREE.LineCurve3(new THREE.Vector3(-w, g, 0), new THREE.Vector3(-w, h - r, 0)));
    tPath.add(
      new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(-w, h - r, 0),
        new THREE.Vector3(-w, h, 0),
        new THREE.Vector3(-w + r, h, 0),
      ),
    );
    tPath.add(
      new THREE.LineCurve3(new THREE.Vector3(-w + r, h, 0), new THREE.Vector3(w - r, h, 0)),
    );
    tPath.add(
      new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(w - r, h, 0),
        new THREE.Vector3(w, h, 0),
        new THREE.Vector3(w, h - r, 0),
      ),
    );
    tPath.add(new THREE.LineCurve3(new THREE.Vector3(w, h - r, 0), new THREE.Vector3(w, g, 0)));

    const bPath = new THREE.CurvePath<THREE.Vector3>();
    bPath.add(
      new THREE.LineCurve3(new THREE.Vector3(-w, -g, 0), new THREE.Vector3(-w, -(h - r), 0)),
    );
    bPath.add(
      new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(-w, -(h - r), 0),
        new THREE.Vector3(-w, -h, 0),
        new THREE.Vector3(-w + r, -h, 0),
      ),
    );
    bPath.add(
      new THREE.LineCurve3(new THREE.Vector3(-w + r, -h, 0), new THREE.Vector3(w - r, -h, 0)),
    );
    bPath.add(
      new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(w - r, -h, 0),
        new THREE.Vector3(w, -h, 0),
        new THREE.Vector3(w, -(h - r), 0),
      ),
    );
    bPath.add(
      new THREE.LineCurve3(new THREE.Vector3(w, -(h - r), 0), new THREE.Vector3(w, -g, 0)),
    );

    return { topPath: tPath, bottomPath: bPath };
  }, []);

  return (
    <group ref={groupRef} position={position} rotation={rotation} scale={scale}>
      <mesh ref={heartEyeRef} visible={false} material={heartMat}>
        <tubeGeometry args={[sharedHeartCurve, 64, 0.0035, 8, true]} />
      </mesh>

      <group ref={normalEyesRef}>
        <mesh material={eyeMat}>
          <tubeGeometry args={[topPath, 20, 0.0035, 8, false]} />
        </mesh>
        <mesh material={eyeMat}>
          <tubeGeometry args={[bottomPath, 20, 0.0035, 8, false]} />
        </mesh>
      </group>
    </group>
  );
}

/* ──────────────── procedural PBR speckle texture (verbatim) ──────────────── */

function generatePbrTexturesAsync(): Promise<{
  colorMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
}> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const size = 512;
      const canvasC = document.createElement("canvas");
      const canvasB = document.createElement("canvas");
      canvasC.width = canvasB.width = size;
      canvasC.height = canvasB.height = size;
      const ctxC = canvasC.getContext("2d");
      const ctxB = canvasB.getContext("2d");

      if (ctxC && ctxB) {
        ctxC.fillStyle = "#dcdcdc";
        ctxC.fillRect(0, 0, size, size);
        ctxB.fillStyle = "#808080";
        ctxB.fillRect(0, 0, size, size);

        for (let i = 0; i < 10000; i++) {
          const x = Math.random() * size;
          const y = Math.random() * size;
          const r = 0.5 + Math.random() * 1.5;
          const isDark = Math.random() > 0.15;

          ctxC.beginPath();
          ctxC.arc(x, y, r, 0, Math.PI * 2);
          ctxC.fillStyle = isDark ? "#222222" : "#dddddd";
          ctxC.fill();

          ctxB.beginPath();
          ctxB.arc(x, y, r, 0, Math.PI * 2);
          ctxB.fillStyle = isDark ? "#000000" : "#ffffff";
          ctxB.fill();
        }
      }

      const texC = new THREE.CanvasTexture(canvasC);
      const texB = new THREE.CanvasTexture(canvasB);
      texC.wrapS = texB.wrapS = THREE.RepeatWrapping;
      texC.wrapT = texB.wrapT = THREE.RepeatWrapping;

      texC.repeat.set(6, 3);
      texB.repeat.set(6, 3);
      texC.needsUpdate = true;
      texB.needsUpdate = true;

      resolve({ colorMap: texC, bumpMap: texB });
    }, 0);
  });
}

/* ─────────────────────────── RobotPrototype ─────────────────────────── */

/* neck/body params baked from the tuned values RobotHero passed down */
const NECK = {
  baseR: 0.215,
  baseH: -0.05,
  midR: 0.28,
  midH: 0.02,
  lipBottomR: 0.295,
  lipBottomH: 0.045,
  lipTopR: 0.27,
  lipTopH: 0.055,
  innerR: 0.1,
  innerDropH: 0.0,
};
const BODY = { bodyBevelR: 0.235, bodyBevelY: 0.34, bodyBevelT: 0.025 };

function RobotPrototype() {
  const isLovedRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);

  const [textures, setTextures] = useState<{
    colorMap: THREE.CanvasTexture | null;
    bumpMap: THREE.CanvasTexture | null;
  }>({ colorMap: null, bumpMap: null });

  const design = {
    screenColor: CYAN, // original pantallaColor #00ffc6 → repulabs cyan
    screenPower: 3.8,
    screenIntensity: 1.2,
    eyeSeparation: 0.07,
    earScale: 1.3,
    eyeScale: 1.1,
    blinkCycle: 3.0,
    blinkDuration: 0.45,
    chassisColor: "#c4c4c4",
    headHeight: 0.6,
  };

  const config = {
    moveSpeed: 0.35,
    bodyRotSpeed: 10.0,
    headRotSpeed: 20.0,
    bodyTiltX: 0.0,
    bodyTiltY: 0.95,
    headLookX: 0.3,
    headLookY: 1.8,
  };

  const BASE_Y = -0.32;

  useFrame((state, delta) => {
    if (!bodyRef.current || !headRef.current) return;

    const dt = Math.min(delta, 0.1);
    const t = state.clock.getElapsedTime();

    const tx = state.pointer.x;
    const ty = state.pointer.y;

    const maxMoveX = state.viewport.width / 3.5;
    const targetPosX = tx * maxMoveX;
    bodyRef.current.position.x = THREE.MathUtils.lerp(
      bodyRef.current.position.x,
      targetPosX,
      config.moveSpeed * dt,
    );

    /* idle float — gentle hover bob layered under the pointer tracking */
    bodyRef.current.position.y = BASE_Y + Math.sin(t * 1.15) * 0.045;

    const relativeX = tx - bodyRef.current.position.x / 2.5;

    const bodyTargetRotY = -relativeX * config.bodyTiltY;
    const bodyTargetRotX = relativeX * relativeX * config.bodyTiltX - ty * 0.25;
    const bodyTargetRotZ = -relativeX * 0.15 + Math.sin(t * 0.9) * 0.02;

    bodyRef.current.rotation.y = THREE.MathUtils.lerp(
      bodyRef.current.rotation.y,
      bodyTargetRotY,
      config.bodyRotSpeed * dt,
    );
    bodyRef.current.rotation.x = THREE.MathUtils.lerp(
      bodyRef.current.rotation.x,
      bodyTargetRotX,
      config.bodyRotSpeed * dt,
    );
    bodyRef.current.rotation.z = THREE.MathUtils.lerp(
      bodyRef.current.rotation.z,
      bodyTargetRotZ,
      config.bodyRotSpeed * dt,
    );

    const headTargetRotY = relativeX * config.headLookY;
    const headTargetRotX = -ty * config.headLookX;

    headRef.current.rotation.y = THREE.MathUtils.lerp(
      headRef.current.rotation.y,
      headTargetRotY,
      config.headRotSpeed * dt,
    );
    headRef.current.rotation.x = THREE.MathUtils.lerp(
      headRef.current.rotation.x,
      headTargetRotX,
      config.headRotSpeed * dt,
    );
  });

  useEffect(() => {
    let mounted = true;
    let generatedMaps: { colorMap: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } | null =
      null;

    generatePbrTexturesAsync().then((res) => {
      if (mounted) {
        generatedMaps = res;
        setTextures(res);
      } else {
        res.colorMap.dispose();
        res.bumpMap.dispose();
      }
    });

    return () => {
      mounted = false;
      if (generatedMaps) {
        generatedMaps.colorMap.dispose();
        generatedMaps.bumpMap.dispose();
      }
    };
  }, []);

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    isLovedRef.current = true;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      isLovedRef.current = false;
    }, 2000);
  };

  const neckProfile = useMemo(() => {
    const points = [];
    points.push(new THREE.Vector2(NECK.innerR, NECK.baseH));
    points.push(new THREE.Vector2(NECK.baseR, NECK.baseH));
    points.push(new THREE.Vector2(NECK.midR, NECK.midH));
    points.push(new THREE.Vector2(NECK.lipBottomR, NECK.lipBottomH));
    points.push(new THREE.Vector2(NECK.lipTopR, NECK.lipTopH));
    points.push(new THREE.Vector2(NECK.innerR, NECK.lipTopH));
    points.push(new THREE.Vector2(NECK.innerR, NECK.lipTopH - NECK.innerDropH));
    return points;
  }, []);

  const headMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#111111",
        roughness: 1.0,
        metalness: 0.0,
      }),
    [],
  );

  if (!textures.colorMap) return null;

  return (
    <group
      ref={bodyRef}
      position={[0, BASE_Y, 0]}
      onPointerDown={handlePointerDown}
      onPointerOver={() => {
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "auto";
      }}
    >
      <mesh castShadow receiveShadow>
        <sphereGeometry args={[0.43, 64, 64, 0, Math.PI * 2, Math.PI * 0.15, Math.PI * 0.85]} />
        <meshStandardMaterial
          color={design.chassisColor}
          map={textures.colorMap || undefined}
          bumpMap={textures.bumpMap || undefined}
          bumpScale={0.005}
          roughness={1.0}
          metalness={0.0}
          envMapIntensity={0.0}
        />
      </mesh>

      {BODY.bodyBevelT > 0 && (
        <mesh
          position={[0, BODY.bodyBevelY, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          castShadow
          receiveShadow
        >
          <torusGeometry args={[BODY.bodyBevelR, BODY.bodyBevelT, 32, 64]} />
          <meshStandardMaterial
            color={design.chassisColor}
            map={textures.colorMap || undefined}
            bumpMap={textures.bumpMap || undefined}
            bumpScale={0.005}
            roughness={1.0}
            metalness={0.0}
            envMapIntensity={0.0}
          />
        </mesh>
      )}

      <mesh position={[0, 0.38, 0]} receiveShadow castShadow>
        <latheGeometry args={[neckProfile, 64]} />
        <meshStandardMaterial
          color={design.chassisColor}
          map={textures.colorMap || undefined}
          bumpMap={textures.bumpMap || undefined}
          bumpScale={0.005}
          roughness={1.0}
          metalness={0.0}
          envMapIntensity={0.0}
        />
      </mesh>

      <group ref={headRef} position={[0, design.headHeight, 0]}>
        <mesh material={headMat} castShadow receiveShadow>
          <sphereGeometry args={[0.28, 64, 64, 0, Math.PI * 2, 0, Math.PI]} />
        </mesh>

        <GlassCapsule
          color={design.screenColor}
          power={design.screenPower}
          intensity={design.screenIntensity}
        />

        <group position={[0, -0.02, 0.29]}>
          <RobotEye
            position={[-design.eyeSeparation, 0, 0]}
            rotation={[0, -0.2, 0]}
            scale={design.eyeScale}
            blinkDuration={design.blinkDuration}
            blinkCycle={design.blinkCycle}
            isLovedRef={isLovedRef}
          />
          <RobotEye
            position={[design.eyeSeparation, 0, 0]}
            rotation={[0, 0.2, 0]}
            scale={design.eyeScale}
            blinkDuration={design.blinkDuration}
            blinkCycle={design.blinkCycle}
            isLovedRef={isLovedRef}
          />
        </group>

        <RobotEar position={[-0.29, 0, 0]} isLeft={true} scale={design.earScale} />
        <RobotEar position={[0.29, 0, 0]} isLeft={false} scale={design.earScale} />
      </group>
    </group>
  );
}

/* ── tiny error boundary so a failed HDR fetch can never crash the page ── */

class EnvBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/* ─────────────────────────── RobotScene (default) ─────────────────────────── */

export default function RobotScene() {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [0, 0.15, 5], fov: 38 }}
      gl={{ antialias: true, alpha: true }}
      style={{ background: "transparent" }}
    >
      {/* lighting retuned for the dark navy card (original sat on light grey) */}
      <ambientLight intensity={1.05} color="#ffffff" />
      <directionalLight position={[2, 4, 3]} intensity={0.8} color="#dbe6ff" />
      {/* cyan rim from behind-left, blue kiss from the right — brand glow */}
      <directionalLight position={[-4, 1.5, -3]} intensity={1.3} color={CYAN} />
      <directionalLight position={[4, -1, -2]} intensity={0.6} color={BLUE} />

      {/* original used Environment preset="studio" (CDN HDR) — the app CSP
          blocks cross-origin fetches, so we build an equivalent studio env
          locally from Lightformers: white key overhead, cyan/blue side cards. */}
      <EnvBoundary>
        <Suspense fallback={null}>
          <Environment resolution={64} frames={1}>
            <Lightformer intensity={2.2} position={[0, 3, 2]} scale={[6, 3, 1]} color="#ffffff" />
            <Lightformer intensity={1.4} position={[-4, 1, 1]} scale={[3, 4, 1]} color={CYAN} />
            <Lightformer intensity={0.9} position={[4, 0, 1]} scale={[3, 4, 1]} color={BLUE} />
          </Environment>
        </Suspense>
      </EnvBoundary>

      <ResponsiveGroup>
        <ContactShadows
          position={[0, -0.82, 0]}
          opacity={0.55}
          scale={15}
          resolution={1024}
          blur={1.7}
          far={2.5}
          color="#010409"
        />
        <RobotPrototype />
      </ResponsiveGroup>
    </Canvas>
  );
}
