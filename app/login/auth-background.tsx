"use client";

import AnimatedGradient from "@/components/ui/animated-gradient";
import { InfinityBackground } from "@/components/ui/animated-infinity-background";
import { EarthBlaze } from "@/components/ui/earth-blaze";
import { WavyBackground } from "@/components/ui/wavy-background";

/**
 * Full-page animated background for /login and /signup, with four looks the
 * founder is comparing. Calm navy / blue / teal palette (no loud purple).
 * Pick one per page with `?bg=waves|infinity|gradient|earth` while previewing;
 * DEFAULT_AUTH_BG is what everyone sees otherwise.
 */
export type AuthBg = "waves" | "infinity" | "gradient" | "earth";
export const AUTH_BGS: AuthBg[] = ["waves", "infinity", "gradient", "earth"];
export const DEFAULT_AUTH_BG: AuthBg = "earth";

export function parseAuthBg(raw: string | null | undefined): AuthBg {
  return AUTH_BGS.includes(raw as AuthBg) ? (raw as AuthBg) : DEFAULT_AUTH_BG;
}

const WAVE_COLORS = ["#1d4ed8", "#38bdf8", "#22d3ee", "#60a5fa", "#93c5fd"];

export function AuthBackground({ variant }: { variant: AuthBg }) {
  return (
    <div className={`auth-bg auth-bg--${variant}`} aria-hidden="true">
      {variant === "waves" && (
        <WavyBackground
          containerClassName="h-full"
          backgroundFill="#0b1224"
          colors={WAVE_COLORS}
          waveWidth={50}
          blur={10}
          speed="slow"
          waveOpacity={0.5}
        />
      )}
      {variant === "infinity" && <InfinityBackground background="#f6f8fb" lineColor="#1e293b" />}
      {variant === "gradient" && (
        <AnimatedGradient
          config={{
            preset: "custom",
            color1: "#0b1224",
            color2: "#1d4ed8",
            color3: "#38bdf8",
            rotation: 25,
            proportion: 45,
            scale: 0.6,
            speed: 14,
            distortion: 6,
            swirl: 80,
            swirlIterations: 8,
            softness: 90,
            offset: 0,
            shape: "Checks",
            shapeSize: 28,
          }}
        />
      )}
      {variant === "earth" && (
        <EarthBlaze
          // The NASA texture host is blocked by our CSP; the rim-lit planet,
          // nebula and stars render without it.
          textureUrl=""
          // Pointer moves the sunlight along the horizon; press-and-hold, then
          // release, sends an aurora along the limb. Mouse/touch only: the
          // canvas stays out of the Tab order so keyboard users go straight to
          // the form.
          interactive
          auroraEnabled
          keyboard={false}
          // Brighter than the stock look: dense starfield, vivid nebula, and a
          // softly lit planet surface along the sunrise.
          starCount={5400}
          galaxyBrightness={2.2}
          surfaceBrightness={3}
          illumination={1.6}
          style={{ position: "absolute", inset: 0, height: "100%", aspectRatio: "auto" }}
        />
      )}
    </div>
  );
}
