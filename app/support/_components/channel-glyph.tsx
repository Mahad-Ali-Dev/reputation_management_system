"use client";

/**
 * ChannelGlyph — brand channel mark for the Unified Inbox.
 *
 * Uses the REAL kit brand icons (designs/unified inbox/conversations/active state/
 * illustration → public/assets/repulabs/unified-inbox/) for the platforms the kit
 * ships: Facebook, Messenger, Instagram, WhatsApp, Email. These are full-colour,
 * self-contained marks (their own disc/gradient), so they render identically in
 * the channel rail, the conversation badges, and the contact panel.
 *
 * Channels the kit has no icon for (live chat, Google, SMS, phone) fall back to a
 * crisp inline glyph in the brand colour. `mode` only affects that fallback.
 */

const ASSET = "/assets/repulabs/unified-inbox";

// channel → real kit brand icon (full-colour mark)
const KIT_ICON: Record<string, string> = {
  facebook: `${ASSET}/facebook_icon.svg`,
  facebook_msg: `${ASSET}/messenger_icon.svg`,
  instagram: `${ASSET}/instagram_icon.svg`,
  instagram_dm: `${ASSET}/instagram_icon.svg`,
  whatsapp: `${ASSET}/whatsapp_icon.svg`,
  email: `${ASSET}/envelope_icon.svg`,
};

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

type Mode = "rail" | "badge";

export function ChannelGlyph({
  channel,
  size = 18,
  mode = "rail",
}: {
  channel: string;
  size?: number;
  mode?: Mode;
}) {
  // Real kit brand icons for the platforms the kit ships (full-colour marks).
  const kit = KIT_ICON[channel];
  if (kit) {
    return (
      // biome-ignore lint/performance/noImgElement: static kit brand icon
      <img
        src={kit}
        alt=""
        aria-hidden
        width={size}
        height={size}
        style={{ display: "block", objectFit: "contain", flexShrink: 0 }}
      />
    );
  }

  // Fallback inline glyph for channels the kit has no icon for. Always brand-
  // coloured so it reads on a white rail button or a white badge disc (the kit
  // brand icons above are full-colour and sit on white too).
  void mode;
  const color = channelBrand(channel);
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    "aria-hidden": true as const,
    focusable: "false" as const,
  };

  switch (channel) {
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
          <path
            d="M21 12a8 8 0 0 1-12.4 6.7L3 20l1.3-5.3A8 8 0 1 1 21 12Z"
            stroke={color}
            strokeWidth="2"
            strokeLinejoin="round"
          />
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
