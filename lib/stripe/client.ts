import Stripe from "stripe";

/**
 * Lazy Stripe client — instantiates on first use, NOT at module load.
 * Prevents Next.js build from failing when STRIPE_SECRET_KEY isn't set in CI environments.
 */

let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY not set. Copy .env.example to .env.local and add your Stripe key.",
    );
  }
  _stripe = new Stripe(key, {
    apiVersion: "2025-02-24.acacia",
    typescript: true,
    appInfo: { name: "Repulabs", version: "0.1.0" },
  });
  return _stripe;
}

// Proxy: every method/property access goes through the lazy getter.
export const stripe = new Proxy({} as Stripe, {
  get(_, prop, receiver) {
    return Reflect.get(getStripe(), prop, receiver);
  },
});

export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";
export const STRIPE_PRO_PRICE_ID = process.env.STRIPE_PRO_PRICE_ID ?? "";
export const STRIPE_HARDWARE_STAND_PRICE_ID = process.env.STRIPE_HARDWARE_STAND_PRICE_ID ?? "";

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
