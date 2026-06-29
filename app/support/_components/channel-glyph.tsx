"use client";

/**
 * ChannelGlyph — brand channel mark for the Unified Inbox conversations view.
 *
 * The shared Icon set has no brand channel glyphs (WhatsApp / Messenger / a
 * coloured Instagram, etc.), and the kit's channel rail + conversation badges
 * need actual brand colours so the rail is instantly scannable (handoff §11).
 * These are simplified single-letter / glyph marks in each platform's brand
 * colour — small, crisp, and dependency-free.
 *
 * `mode="badge"` renders the tiny circular mark overlaid on an avatar (white
 * glyph on a brand-coloured disc). `mode="rail"` renders the larger rail glyph
 * (brand-coloured glyph on the white rail button).
 */

type Mode = "rail" | "badge";

const BRAND: Record<string, string> = {
  facebook_msg: "#0084ff",
  facebook: "#1877f2",
  instagram_dm: "#e4405f",
  instagram: "#e4405f",
  whatsapp: "#25d366",
  webchat: "#6c4df6",
  gbp_qa: "#ea4335",
  google: "#ea4335",
  email: "#8b35ff",
  sms: "#20bf6b",
  phone: "#20bf6b",
};

export function channelBrand(channel: string): string {
  return BRAND[channel] ?? "#657197";
}

export function ChannelGlyph({
  channel,
  size = 18,
  mode = "rail",
}: {
  channel: string;
  size?: number;
  mode?: Mode;
}) {
  const color = mode === "badge" ? "#fff" : channelBrand(channel);
  const s = size;
  const common = {
    width: s,
    height: s,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    "aria-hidden": true as const,
    focusable: "false" as const,
  };

  switch (channel) {
    case "facebook_msg":
    case "facebook":
      // Messenger-style chat bolt / "f"
      return (
        <svg {...common}>
          <path
            d="M12 3C6.9 3 3 6.8 3 11.7c0 2.6 1.1 4.9 3 6.5V22l2.8-1.5c.7.2 1.5.3 2.2.3 5.1 0 9-3.8 9-8.7S17.1 3 12 3Z"
            fill={mode === "badge" ? "#fff" : channelBrand(channel)}
            opacity={mode === "badge" ? 1 : 0.16}
          />
          <path
            d="m7 13.5 2.7-2.8 1.9 1.4 2.4-1.6-2.6 2.8-1.9-1.3L7 13.5Z"
            fill={mode === "badge" ? channelBrand("facebook_msg") : channelBrand(channel)}
          />
        </svg>
      );
    case "instagram_dm":
    case "instagram":
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="16" rx="5" stroke={color} strokeWidth="2" />
          <circle cx="12" cy="12" r="3.6" stroke={color} strokeWidth="2" />
          <circle cx="16.4" cy="7.6" r="1" fill={color} />
        </svg>
      );
    case "whatsapp":
      return (
        <svg {...common}>
          <path
            d="M12 3.5a8.4 8.4 0 0 0-7.2 12.7L4 20.5l4.4-1.1A8.4 8.4 0 1 0 12 3.5Z"
            fill={mode === "badge" ? "#fff" : channelBrand(channel)}
            opacity={mode === "badge" ? 1 : 0.16}
          />
          <path
            d="M9.4 8.3c-.2-.4-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.3.3-.9.9-.9 2.1s.9 2.4 1 2.6c.1.2 1.8 2.9 4.5 3.9 2.2.9 2.7.7 3.2.6.5 0 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2-.1-.1-.3-.2-.6-.4l-1.5-.7c-.2-.1-.4-.1-.6.1l-.6.8c-.1.2-.3.2-.5.1-.3-.1-1.1-.4-2-1.2-.7-.6-1.2-1.4-1.3-1.6-.1-.2 0-.4.1-.5l.4-.5c.1-.2.2-.3.3-.5 0-.2 0-.3 0-.5l-.7-1.6Z"
            fill={mode === "badge" ? channelBrand("whatsapp") : channelBrand(channel)}
          />
        </svg>
      );
    case "webchat":
      return (
        <svg {...common}>
          <path
            d="M21 11.5a7.5 7.5 0 0 1-11.4 6.4L4 19.5l1.2-4.7A7.5 7.5 0 1 1 21 11.5Z"
            stroke={color}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <circle cx="9" cy="11.5" r="1" fill={color} />
          <circle cx="12.5" cy="11.5" r="1" fill={color} />
          <circle cx="16" cy="11.5" r="1" fill={color} />
        </svg>
      );
    case "gbp_qa":
    case "google":
      return (
        <svg {...common}>
          <path
            d="M21 12c0 5-3.6 8.5-9 8.5A8.5 8.5 0 1 1 17.9 5l-2.6 2.5A4.9 4.9 0 1 0 16.8 13H12v-3h8.7c.2.6.3 1.3.3 2Z"
            fill={color}
          />
        </svg>
      );
    case "email":
      return (
        <svg {...common}>
          <rect x="3" y="5.5" width="18" height="13" rx="2.5" stroke={color} strokeWidth="2" />
          <path d="m4 7 8 5.5L20 7" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "sms":
      return (
        <svg {...common}>
          <path
            d="M20 4H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h3v3l3.5-3H20a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1Z"
            stroke={color}
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "phone":
      return (
        <svg {...common}>
          <path
            d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 1.9.6 2.8a2 2 0 0 1-.4 2.1L8 9.8a16 16 0 0 0 6 6l1.2-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.5 2.8.6a2 2 0 0 1 1.7 2.1Z"
            stroke={color}
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M21 12a8 8 0 0 1-12.4 6.7L3 20l1.3-5.3A8 8 0 1 1 21 12Z" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        </svg>
      );
  }
}

const CHANNEL_LABEL: Record<string, string> = {
  email: "Email",
  facebook_msg: "Facebook",
  instagram_dm: "Instagram",
  whatsapp: "WhatsApp",
  gbp_qa: "Google",
  webchat: "Live Chat",
  sms: "SMS",
  phone: "Phone",
};

export function channelLabel(channel: string): string {
  return CHANNEL_LABEL[channel] ?? channel;
}
