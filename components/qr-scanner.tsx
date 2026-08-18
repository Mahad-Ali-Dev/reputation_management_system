"use client";

/**
 * Live camera QR scanner — opens the device's camera (rear-facing on a
 * phone, whatever's available on a laptop), decodes QR codes frame-by-frame
 * with `jsqr`, and hands the raw decoded text to the caller via `onScan`.
 *
 * Deliberately dumb about WHAT the QR code means — `onScan` returns a
 * boolean: `true` ("that's the one, I'm done") stops the camera and the
 * caller is expected to close the scanner (`open={false}`); `false` ("not
 * what I was looking for") keeps the camera running and flashes a brief
 * rejection hint, so a stray/unrelated QR code doesn't get accepted.
 *
 * Always stops every camera track on close/unmount — never leaves the
 * camera running in the background. Requires a secure context (https, or
 * localhost in dev) — `navigator.mediaDevices` is undefined otherwise, which
 * surfaces as the same "couldn't access the camera" error as a real denial.
 */

import jsQR from "jsqr";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/shell/icon";

export function QrCameraScanner({
  open,
  onScan,
  onClose,
  title = "Scan QR code",
  instructions = "Point your camera at the QR code",
}: {
  open: boolean;
  /** Return true to accept the scan (caller then closes the scanner) or
   *  false to reject it and keep scanning. */
  onScan: (text: string) => boolean;
  onClose: () => void;
  title?: string;
  instructions?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const stoppedRef = useRef(false);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState(false);

  useEffect(() => {
    if (!open) return;
    stoppedRef.current = false;
    setError(null);
    setRejected(false);
    let cancelled = false;
    let rejectTimer: ReturnType<typeof setTimeout> | null = null;

    function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || stoppedRef.current) return;

      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(frame.data, frame.width, frame.height);
          if (code?.data) {
            const accepted = onScanRef.current(code.data);
            if (accepted) {
              stoppedRef.current = true;
              return;
            }
            setRejected(true);
            if (rejectTimer) clearTimeout(rejectTimer);
            rejectTimer = setTimeout(() => setRejected(false), 1600);
          }
        }
      }
      if (!stoppedRef.current) rafRef.current = requestAnimationFrame(tick);
    }

    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError("Camera access isn't available on this browser. Enter the link manually below.");
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          for (const t of stream.getTracks()) t.stop();
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        rafRef.current = requestAnimationFrame(tick);
      } catch (err) {
        setError(
          err instanceof DOMException && err.name === "NotAllowedError"
            ? "Camera access was denied. Enable it in your browser settings, or enter the link manually below."
            : "Couldn't access the camera on this device. Enter the link manually below.",
        );
      }
    }

    start();

    return () => {
      cancelled = true;
      stoppedRef.current = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (rejectTimer) clearTimeout(rejectTimer);
      if (streamRef.current) {
        for (const t of streamRef.current.getTracks()) t.stop();
      }
      streamRef.current = null;
    };
  }, [open]);

  // Esc closes; lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 300,
        display: "grid",
        placeItems: "center",
        background: "rgba(10, 12, 20, 0.86)",
        padding: 16,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          position: "relative",
          width: "min(420px, 100%)",
          aspectRatio: error ? "auto" : "3 / 4",
          borderRadius: 20,
          overflow: "hidden",
          background: "#0b0d14",
          boxShadow: "0 30px 80px rgba(0, 0, 0, 0.5)",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close scanner"
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            zIndex: 2,
            width: 36,
            height: 36,
            borderRadius: "50%",
            border: "none",
            background: "rgba(255, 255, 255, 0.94)",
            color: "#111936",
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
          }}
        >
          <Icon name="x" size={16} stroke={2.2} />
        </button>

        {error ? (
          <div
            style={{
              padding: "56px 28px",
              color: "#fff",
              textAlign: "center",
              fontSize: 14,
              lineHeight: 1.6,
            }}
          >
            <Icon name="alert" size={26} />
            <p style={{ marginTop: 12 }}>{error}</p>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              muted
              playsInline
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
            <div
              aria-hidden
              style={{
                position: "absolute",
                inset: "14% 10%",
                border: `3px solid ${rejected ? "#f87171" : "rgba(255,255,255,0.9)"}`,
                borderRadius: 20,
                transition: "border-color 0.2s ease",
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: 20,
                left: 16,
                right: 16,
                textAlign: "center",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                textShadow: "0 1px 4px rgba(0,0,0,0.7)",
              }}
            >
              {rejected
                ? "That doesn't look like a repulabs stand code — try again"
                : instructions}
            </div>
          </>
        )}
      </div>
      <canvas ref={canvasRef} style={{ display: "none" }} />
    </div>
  );
}
