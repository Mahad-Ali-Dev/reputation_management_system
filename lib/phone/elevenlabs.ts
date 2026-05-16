/**
 * ElevenLabs voice cloning + TTS integration for AI Phone Receptionist.
 *
 * Flow:
 *   1. Org uploads a 30-90s audio sample → we POST to /v1/voices/add
 *   2. ElevenLabs returns a voice_id → save in phone_voices table
 *   3. On each AI response, we generate audio via /v1/text-to-speech/{voice_id}
 *   4. Cache by sha256(text + voice_id) in Vercel Blob to avoid re-generation
 *   5. Return audio URL to Twilio via <Play>
 *
 * Latency note: ElevenLabs non-streaming TTS is ~1-2s for short phrases.
 * Combined with Claude's ~1.5s, total turn latency is ~3-4s. Acceptable but
 * noticeably slower than Twilio's built-in <Say> (instant).
 *
 * Phase 2 upgrade: use /stream endpoint + Twilio media streams for real-time
 * (~500ms total). Out of scope for v2.
 */

import { createHash } from "node:crypto";
import { put, head } from "@vercel/blob";

const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";

// Default timeout for ElevenLabs HTTP calls. TTS for short phrases is ~1-2s,
// clone is ~5-10s. Without an explicit timeout, Next.js will hold a connection
// open indefinitely if ElevenLabs hangs — burning our Lambda budget.
const ELEVENLABS_TIMEOUT_MS = 20_000;

async function fetchWithTimeout(url: string, init: RequestInit & { timeoutMs?: number }): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? ELEVENLABS_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export type ElevenLabsConfig = {
  apiKey: string;
};

function getConfig(): ElevenLabsConfig | null {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return null;
  return { apiKey };
}

export function isElevenLabsConfigured(): boolean {
  return !!process.env.ELEVENLABS_API_KEY;
}

/**
 * Clone a voice from a single audio sample.
 *
 * Sample requirements:
 *   - 30-90 seconds of clean speech
 *   - One speaker, no background music
 *   - WAV, MP3, OGG, or FLAC up to 10 MB
 *
 * Returns the voice_id for storage in phone_voices.
 */
export async function cloneVoice(args: {
  apiKey?: string;
  displayName: string;
  description?: string;
  sampleAudio: Blob;
}): Promise<{ voiceId: string; previewUrl?: string }> {
  const config = args.apiKey ? { apiKey: args.apiKey } : getConfig();
  if (!config) throw new Error("ELEVENLABS_API_KEY not set");

  const form = new FormData();
  form.append("name", args.displayName);
  if (args.description) form.append("description", args.description);
  form.append("files", args.sampleAudio, "sample.wav");

  const res = await fetchWithTimeout(`${ELEVENLABS_BASE}/voices/add`, {
    method: "POST",
    headers: { "xi-api-key": config.apiKey },
    body: form,
    timeoutMs: 30_000, // clone uploads can be slower
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`elevenlabs_clone_failed: ${res.status} ${err.slice(0, 300)}`);
  }
  const data = (await res.json()) as { voice_id: string; preview_url?: string };
  return { voiceId: data.voice_id, previewUrl: data.preview_url };
}

/**
 * Generate TTS audio for a phrase. Returns a public URL pointing to the cached MP3
 * (or freshly-generated if not in cache).
 *
 * Caching: keyed by sha256(text + voiceId + model). Saves ~$0.0003/char of
 * regenerated audio (ElevenLabs is ~$0.30 per 1000 chars on the Creator plan).
 */
export async function synthesizeAndCache(args: {
  text: string;
  voiceId: string;
  model?: string;
  apiKey?: string;
}): Promise<{ url: string; cached: boolean }> {
  const config = args.apiKey ? { apiKey: args.apiKey } : getConfig();
  if (!config) throw new Error("ELEVENLABS_API_KEY not set");

  const model = args.model ?? "eleven_turbo_v2_5";
  const cacheKey = createHash("sha256")
    .update(`${args.voiceId}|${model}|${args.text}`)
    .digest("hex")
    .slice(0, 32);
  const pathname = `phone-audio/${args.voiceId}/${cacheKey}.mp3`;

  // Check cache first (Vercel Blob)
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const existing = await head(pathname);
      if (existing) {
        return { url: existing.url, cached: true };
      }
    } catch {
      // Not in cache, generate fresh
    }
  }

  // Generate fresh
  const ttsRes = await fetchWithTimeout(`${ELEVENLABS_BASE}/text-to-speech/${args.voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": config.apiKey,
      "content-type": "application/json",
      accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: args.text,
      model_id: model,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true,
      },
    }),
  });
  if (!ttsRes.ok) {
    const err = await ttsRes.text().catch(() => "");
    throw new Error(`elevenlabs_tts_failed: ${ttsRes.status} ${err.slice(0, 300)}`);
  }
  const audioBuffer = Buffer.from(await ttsRes.arrayBuffer());

  // Upload to Vercel Blob (or fall back to data: URL for dev)
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    // Dev fallback — return a data URL. Twilio CAN'T play data URLs over the phone,
    // so this only works in pure unit-test contexts. Phone calls in dev should
    // use Twilio's <Say> by leaving voiceProvider = 'twilio'.
    return {
      url: `data:audio/mpeg;base64,${audioBuffer.toString("base64")}`,
      cached: false,
    };
  }

  const result = await put(pathname, audioBuffer, {
    access: "public",
    contentType: "audio/mpeg",
    addRandomSuffix: false,  // we control the key for cache hits
  });
  return { url: result.url, cached: false };
}

/**
 * List voices for an account (your shared library + cloned).
 * Useful for picker UIs.
 */
export async function listVoices(args: { apiKey?: string }): Promise<
  Array<{
    voice_id: string;
    name: string;
    description?: string;
    preview_url?: string;
    category?: string;
  }>
> {
  const config = args.apiKey ? { apiKey: args.apiKey } : getConfig();
  if (!config) throw new Error("ELEVENLABS_API_KEY not set");
  const res = await fetchWithTimeout(`${ELEVENLABS_BASE}/voices`, {
    headers: { "xi-api-key": config.apiKey, accept: "application/json" },
  });
  if (!res.ok) throw new Error(`elevenlabs_list_failed: ${res.status}`);
  const data = (await res.json()) as { voices: Array<{ voice_id: string; name: string; description?: string; preview_url?: string; category?: string }> };
  return data.voices;
}

/**
 * Delete a cloned voice (when the org disables it).
 */
export async function deleteVoice(args: { apiKey?: string; voiceId: string }): Promise<void> {
  const config = args.apiKey ? { apiKey: args.apiKey } : getConfig();
  if (!config) return;
  await fetchWithTimeout(`${ELEVENLABS_BASE}/voices/${args.voiceId}`, {
    method: "DELETE",
    headers: { "xi-api-key": config.apiKey },
    timeoutMs: 10_000,
  });
}
