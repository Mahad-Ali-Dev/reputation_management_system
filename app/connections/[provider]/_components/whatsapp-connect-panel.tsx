"use client";

/**
 * WhatsApp Business connect panel — BACK-COMPAT SHIM (Module 09 → 14).
 *
 * The original WhatsApp-only paste form has been generalised into the reusable
 * `ApiKeyConnectPanel` (./api-key-connect-panel), driven by the per-provider
 * field spec in app/connections/_lib/api-key-fields.ts. WhatsApp is now just the
 * two-field (phone_number_id + token) case of that generic form.
 *
 * This thin wrapper is kept so any existing import of `WhatsAppConnectPanel`
 * keeps working: it resolves WhatsApp's spec and renders the generic panel.
 */

import { API_KEY_SPECS } from "../../_lib/api-key-fields";
import { ApiKeyConnectPanel } from "./api-key-connect-panel";

const WHATSAPP_SPEC = API_KEY_SPECS.whatsapp;

export function WhatsAppConnectPanel({
  action,
  connected,
  errorCode,
}: {
  action: (formData: FormData) => void | Promise<void>;
  connected: boolean;
  errorCode: string | null;
}) {
  return (
    <ApiKeyConnectPanel
      spec={{
        provider: WHATSAPP_SPEC.provider,
        displayName: WHATSAPP_SPEC.displayName,
        blurb: WHATSAPP_SPEC.blurb,
        fields: WHATSAPP_SPEC.fields,
      }}
      action={action}
      connected={connected}
      errorCode={errorCode}
    />
  );
}
