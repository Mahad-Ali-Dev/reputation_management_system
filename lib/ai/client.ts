import Anthropic from "@anthropic-ai/sdk";

/**
 * Lazy Anthropic client. Module-load safe (build won't fail without ANTHROPIC_API_KEY).
 */
let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === "sk-ant-...") {
    throw new Error(
      "ANTHROPIC_API_KEY not set. Get a key at https://console.anthropic.com/settings/keys",
    );
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

export const anthropic = new Proxy({} as Anthropic, {
  get(_, prop, receiver) {
    return Reflect.get(getClient(), prop, receiver);
  },
});

// Model constants — change these when migrating model versions (AI_STRATEGY.md §13).
export const MODELS = {
  SONNET: "claude-sonnet-4-5-20250929" as const, // most stable Sonnet 4.5 alias
  HAIKU: "claude-haiku-4-5-20251001" as const,
  OPUS: "claude-opus-4-5-20250929" as const,
} as const;

// Pricing per million tokens (USD), used to compute cost_micros.
// Update when Anthropic adjusts pricing.
export const PRICING = {
  [MODELS.SONNET]: { input: 3, output: 15, cache_read: 0.3, cache_write_5m: 3.75 },
  [MODELS.HAIKU]: { input: 1, output: 5, cache_read: 0.1, cache_write_5m: 1.25 },
  [MODELS.OPUS]: { input: 15, output: 75, cache_read: 1.5, cache_write_5m: 18.75 },
} as const;
