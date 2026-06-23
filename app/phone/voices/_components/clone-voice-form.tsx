"use client";

import { Icon } from "@/components/shell/icon";
import { uploadAndCloneVoice } from "@/lib/phone/voice-actions";
import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";

/**
 * "Clone a new voice" card — design-kit voice-cloning form (name + accent +
 * audio dropzone), restyled to the mockup. Thin client island over the EXISTING
 * `uploadAndCloneVoice` server action; field names are unchanged:
 *   displayName · audioSample (file).  ("Dialect / Accent" is part of the kit
 * composition; the backend clone action reads only the fields it validates.)
 *
 * The dropzone wraps a real <input type="file"> (drag-drop + Choose file both
 * set it), so the upload + clone flow works exactly as before. Gated by the real
 * verification status (ElevenLabs configured) passed from the server page.
 */

const ACCENTS = [
  "American",
  "British",
  "Australian",
  "Indian",
  "Irish",
  "Canadian",
  "Other",
];
const ASSET = "/assets/repulabs/phone";

export function CloneVoiceForm({ verified }: { verified: boolean }) {
  const [name, setName] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f && inputRef.current) {
      inputRef.current.files = e.dataTransfer.files;
      setFileName(f.name);
    }
  }

  return (
    <section className="pr-card">
      <div className="pr-step-body">
        <div className="pr-lead">
          <span className="pr-circle pr-lead__circle">
            <img src={`${ASSET}/mic.svg`} alt="" aria-hidden="true" width={30} height={30} />
          </span>
          <div>
            <div className="pr-lead__title">Clone a new voice</div>
            <p className="pr-lead__sub">
              Upload audio of your voice. We'll train the AI to match it to you.
            </p>
          </div>
        </div>

        <form action={uploadAndCloneVoice} style={{ marginTop: 20 }}>
          <div className="pr-two-col">
            <div>
              <label className="pr-field-label" htmlFor="pr-voicename">
                Voice name
                <Icon name="info" size={13} className="pr-info" />
              </label>
              <div className="pr-field-wrap">
                <input
                  id="pr-voicename"
                  name="displayName"
                  required
                  maxLength={50}
                  placeholder="Enter a name (e.g., Bisma's Voice)"
                  className="pr-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <span className="pr-counter">{name.length}/50</span>
              </div>
            </div>
            <div>
              <label className="pr-field-label" htmlFor="pr-accent">
                Dialect / Accent
                <Icon name="info" size={13} className="pr-info" />
              </label>
              <select
                id="pr-accent"
                name="accent"
                className="pr-select"
                defaultValue=""
              >
                <option value="" disabled>
                  Select accent
                </option>
                {ACCENTS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            <label className="pr-field-label" htmlFor="pr-audio">
              Audio sample
            </label>
            <p className="pr-helper" style={{ marginTop: 0 }}>
              Upload high quality audio for best results.
            </p>
            {/* biome-ignore lint/a11y/noStaticElementInteractions: drop target wraps a real keyboard-accessible file input + Choose file button */}
            <div
              className="pr-drop"
              style={dragActive ? { background: "#f6f2ff" } : undefined}
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={onDrop}
            >
              <span className="pr-circle pr-drop__circle">
                <img
                  src={`${ASSET}/cloud-upload.svg`}
                  alt=""
                  aria-hidden="true"
                  width={30}
                  height={30}
                />
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="pr-drop__title">
                  {fileName ?? "Drag & drop your audio here"}
                </div>
                <div className="pr-drop__body">WAV, MP3 up to 25MB</div>
              </div>
              <div className="pr-drop__cta">
                <input
                  ref={inputRef}
                  id="pr-audio"
                  type="file"
                  name="audioSample"
                  accept="audio/wav,audio/mpeg,audio/mp3,audio/ogg,audio/flac,audio/x-wav"
                  required
                  className="sr-only"
                  style={{
                    position: "absolute",
                    width: 1,
                    height: 1,
                    overflow: "hidden",
                    clip: "rect(0 0 0 0)",
                  }}
                  onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
                />
                <button
                  type="button"
                  className="pr-btn pr-btn--pri"
                  style={{ height: 38, padding: "0 16px" }}
                  onClick={() => inputRef.current?.click()}
                >
                  Choose file
                </button>
              </div>
            </div>
          </div>

          {/* Optional description — maps to the real `description` field. */}
          <div style={{ marginTop: 20 }}>
            <div className="pr-lead" style={{ gap: 12, marginBottom: 10 }}>
              <span className="pr-circle" style={{ width: 36, height: 36 }}>
                <img
                  src={`${ASSET}/pencil.svg`}
                  alt=""
                  aria-hidden="true"
                  width={18}
                  height={18}
                />
              </span>
              <label
                className="pr-field-label"
                htmlFor="pr-desc"
                style={{ margin: 0 }}
              >
                You can describe it (optional)
              </label>
            </div>
            <input
              id="pr-desc"
              name="description"
              maxLength={200}
              placeholder="e.g., Calm and professional"
              className="pr-input pr-input--sm"
              style={{ height: 40 }}
            />
          </div>

          <div style={{ marginTop: 20 }}>
            <CloneButton verified={verified} />
            {!verified && (
              <p className="pr-helper" style={{ marginTop: 8 }}>
                <Icon name="info" size={14} className="pr-info" />
                Add an ElevenLabs API key to verify your voice and enable cloning.
              </p>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}

function CloneButton({ verified }: { verified: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="pr-btn pr-btn--pri"
      disabled={!verified || pending}
    >
      <Icon name="sound" size={14} />
      {pending ? "Cloning…" : "Clone voice"}
    </button>
  );
}
