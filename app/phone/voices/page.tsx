import { AppShellServer } from "@/components/app-shell-server";
import { Icon } from "@/components/shell/icon";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import { isElevenLabsConfigured } from "@/lib/phone/elevenlabs";
import {
  deleteClonedVoice,
  revertToTwilioVoice,
  setActiveVoice,
} from "@/lib/phone/voice-actions";
import Link from "next/link";
import { CloneVoiceForm } from "./_components/clone-voice-form";
import "../phone-receptionist.css";

/**
 * Voice cloning — rebuilt to the delivered design kit
 * (designs/Ai phone receptionist/voice cloning). Kit sections: back link +
 * header, verification banner, How-to card, Clone-a-new-voice form, optional
 * description (inside the form), "Can't find your voice?" tips banner, floating
 * chat.
 *
 * LIVE DATA / real wiring:
 *   • Verification status = isElevenLabsConfigured() — drives the warning vs.
 *     ready banner and gates the Clone button (the real precondition for cloning
 *     in lib/phone/voice-actions.ts).
 *   • Clone form → existing `uploadAndCloneVoice` (see ./_components).
 *   • The active-voice card + cloned-voices list are EXISTING working features
 *     (setActiveVoice / revertToTwilioVoice / deleteClonedVoice) with no mockup
 *     equivalent — kept and restyled into kit cards (reported).
 */

export const dynamic = "force-dynamic";
const ASSET = "/assets/repulabs/phone";

export default async function PhoneVoicesPage() {
  const { orgId } = await getOrgContext();

  const [voices, assistant] = await withTenant(orgId, async (tx) =>
    Promise.all([
      tx.phoneVoice.findMany({
        where: { status: "active" },
        orderBy: { createdAt: "desc" },
      }),
      tx.phoneAssistant.findUnique({ where: { organizationId: orgId } }),
    ]),
  ).catch(() => [[], null] as const);

  const verified = isElevenLabsConfigured();
  const activeVoiceId = assistant?.elevenlabsVoiceId;
  const usingClone = assistant?.voiceProvider === "elevenlabs";

  return (
    <div className="pr">
      <AppShellServer topBar={<TopBar title="Voice cloning" />}>
        <Link href="/phone" className="pr-back">
          <Icon name="arrowR" size={14} style={{ transform: "rotate(180deg)" }} />
          Back to AI Phone Receptionist
        </Link>

        {/* Kit header — left title tile + title + sparkle, right purple action */}
        <header className="pr-vc-header">
          <span className="pr-vc-header__tile" aria-hidden="true">
            <img
              src={`${ASSET}/voice-cloning-waveform.svg`}
              alt=""
              width={36}
              height={36}
            />
          </span>
          <div className="pr-vc-header__copy">
            <h1 className="pr-vc-header__title">
              Voice cloning
              <Icon
                name="sparkle"
                size={18}
                className="pr-vc-header__spark"
                stroke={2}
              />
            </h1>
            <p className="pr-vc-header__sub">
              Make AI sound like you with your cloned voice.
            </p>
          </div>
          <span className="pr-btn pr-btn--pri pr-vc-header__btn" aria-hidden="true">
            <Icon name="sound" size={14} />
            Voice cloning
          </span>
        </header>

        <div className="pr-stack">
          {/* ── Verification banner — gated on real status ── */}
          {verified ? (
            <section className="pr-banner pr-banner--ok">
              <span
                className="pr-circle pr-banner__circle"
                style={{ background: "#cdf5e1", color: "#0a9f57" }}
              >
                <Icon name="checkCircle" size={26} />
              </span>
              <div>
                <div className="pr-banner__title">Voice cloning is ready</div>
                <div className="pr-banner__body">
                  Upload a clean sample below to train a custom voice for your
                  receptionist.
                </div>
              </div>
            </section>
          ) : (
            <section className="pr-banner pr-banner--warn">
              <span className="pr-circle pr-banner__circle pr-banner__circle--warn">
                <img
                  src={`${ASSET}/voice-not-verified-shield.svg`}
                  alt=""
                  aria-hidden="true"
                  width={30}
                  height={30}
                />
              </span>
              <div>
                <div className="pr-banner__title">Voice is not verified yet</div>
                <div className="pr-banner__body">
                  Add training data and verify your voice to unlock all features.
                </div>
              </div>
              <a
                href="https://elevenlabs.io/app/settings/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="pr-banner__link-warn pr-banner__cta"
              >
                Go to verification guide
                <Icon name="arrowR" size={13} />
              </a>
            </section>
          )}

          {/* ── How to use ── */}
          <section className="pr-banner pr-banner--soft">
            <span className="pr-circle pr-banner__circle">
              <img
                src={`${ASSET}/book-open.svg`}
                alt=""
                aria-hidden="true"
                width={30}
                height={30}
              />
            </span>
            <div>
              <div className="pr-banner__title">How to use — Train &amp; use</div>
              <div className="pr-banner__body">
                Learn how to clone your voice, add it to AI, and test it in
                minutes.
              </div>
            </div>
            <Link
              href="/phone/assistant"
              aria-label="Open how to use"
              className="pr-circle pr-banner__cta"
              style={{ width: 28, height: 28, background: "#eeeafb" }}
            >
              <Icon name="chevR" size={15} />
            </Link>
          </section>

          {/* ── Active voice (existing working feature, restyled) ── */}
          <section className="pr-card">
            <div className="pr-step-body">
              <div className="pr-lead">
                <span
                  className={`pr-tile pr-lead__circle ${usingClone ? "pr-tile--grad" : "pr-tile--lav"}`}
                  style={{ borderRadius: 14 }}
                >
                  <Icon name="sound" size={26} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="pr-lead__title">
                    Active voice:{" "}
                    {usingClone ? "ElevenLabs clone" : "Twilio (stock)"}
                  </div>
                  <p className="pr-lead__sub">
                    {usingClone
                      ? `Using cloned voice ${voices.find((v) => v.externalVoiceId === activeVoiceId)?.displayName ?? "(unknown)"}.`
                      : `Using Twilio's built-in voice "${assistant?.voice ?? "alice"}" — stable and instant, no latency.`}
                  </p>
                </div>
                {usingClone && (
                  <form action={revertToTwilioVoice}>
                    <button type="submit" className="pr-btn pr-btn--sec pr-btn--xs">
                      Revert to Twilio stock
                    </button>
                  </form>
                )}
              </div>

              {voices.length > 0 && (
                <ul className="pr-voice-list">
                  {voices.map((v) => {
                    const isActive = v.externalVoiceId === activeVoiceId;
                    return (
                      <li key={v.id} className="pr-voice-item">
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="row" style={{ gap: 8, alignItems: "center" }}>
                            <span className="pr-voice-item__name">
                              {v.displayName}
                            </span>
                            {isActive && (
                              <span className="pr-chip pr-chip--ok">Active</span>
                            )}
                          </div>
                          {v.description && (
                            <p className="pr-lead__sub" style={{ marginTop: 2 }}>
                              {v.description}
                            </p>
                          )}
                          {v.previewAudioUrl && (
                            // biome-ignore lint/a11y/useMediaCaption: short voice preview sample, no caption track available
                            <audio controls className="pr-voice-audio">
                              <source src={v.previewAudioUrl} type="audio/mpeg" />
                            </audio>
                          )}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                            flexShrink: 0,
                          }}
                        >
                          {!isActive && (
                            <form action={setActiveVoice}>
                              <input
                                type="hidden"
                                name="voiceId"
                                value={v.externalVoiceId}
                              />
                              <button
                                type="submit"
                                className="pr-btn pr-btn--sec pr-btn--xs"
                              >
                                Use this
                              </button>
                            </form>
                          )}
                          <form action={deleteClonedVoice}>
                            <input type="hidden" name="voiceRecordId" value={v.id} />
                            <button
                              type="submit"
                              className="pr-btn pr-btn--xs"
                              style={{ color: "var(--pr-bad, #c11839)" }}
                            >
                              Delete
                            </button>
                          </form>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          {/* ── Clone a new voice (form island → uploadAndCloneVoice) ── */}
          <CloneVoiceForm verified={verified} />

          {/* ── Can't find your voice? tips ── */}
          <section className="pr-tips">
            <span className="pr-circle pr-tips__circle">
              <img
                src={`${ASSET}/headphones.svg`}
                alt=""
                aria-hidden="true"
                width={32}
                height={32}
              />
            </span>
            <div style={{ minWidth: 0 }}>
              <div className="pr-tips__title">Can't find your voice?</div>
              <ul className="pr-tips__list">
                <li>
                  Try recording in a quiet place with minimal background noise.
                </li>
                <li>Use a clear microphone and speak naturally.</li>
                <li>Our AI works best with 30–60 seconds of clean audio.</li>
                <li>
                  Still having trouble? Contact support or go through our{" "}
                  <a
                    href="https://elevenlabs.io/app/settings/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pr-link"
                  >
                    verification guide
                  </a>{" "}
                  for more tips.
                </li>
              </ul>
            </div>
            <span className="pr-tips__art" aria-hidden="true">
              {/* biome-ignore lint/performance/noImgElement: real kit raster-in-SVG illustration */}
              <img src={`${ASSET}/tips-headphones.svg`} alt="" />
            </span>
          </section>
        </div>
      </AppShellServer>
    </div>
  );
}
