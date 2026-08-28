"use client";

import { Icon } from "@/components/shell/icon";
import { releaseDevice, restoreDevice } from "@/lib/hardware/actions";
import { useState } from "react";
import { useFormStatus } from "react-dom";

/**
 * One card in My Devices → Trash.
 *
 * Two ways out of Trash, and they differ in what happens to the binding:
 *   • Restore — puts the device back exactly as it was, same destination.
 *   • Remove  — releases it from this workspace. The unit itself is untouched,
 *               so it can be set up again any time through the normal flow.
 *
 * Client-side because Remove clears the destination and unbinds the business,
 * which is worth a beat of thought. It discloses in two steps: the card flips
 * to a confirm state explaining what changes and what does not, and only then
 * offers the button. Restore stays one click, being the safe path most people
 * came here for.
 *
 * Nothing is decided on the client — releaseDevice re-checks the role and that
 * the row is actually retired.
 */

export type TrashCardDevice = {
  id: string;
  shortSlug: string;
  productSku: string;
  redirectUrl: string | null;
  createdAt: string;
  establishmentName: string | null;
  scanCount: number;
};

export function TrashDeviceCard({
  device: d,
  canRelease,
}: {
  device: TrashCardDevice;
  /** Only admins/owners may unbind a device — see releaseDevice. */
  canRelease: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  // Reads inline as "Its destination and 2 scans reset." / "Its destination is
  // reset." — one sentence either way, and singular when there's one scan.
  const scanNote =
    d.scanCount > 0
      ? ` and ${d.scanCount.toLocaleString("en-US")} scan${d.scanCount === 1 ? "" : "s"} are`
      : " is";

  return (
    <div className={confirming ? "tdc tdc--confirming" : "tdc"}>
      <div className="tdc__top">
        <span className="tdc__code">{d.shortSlug}</span>
        <span className="tdc__pill">In trash</span>
      </div>

      <h3 className="tdc__name">{d.establishmentName ?? "Unassigned"}</h3>
      <p className="tdc__meta">
        {d.productSku} · added {new Date(d.createdAt).toLocaleDateString()}
        {d.scanCount > 0 &&
          ` · ${d.scanCount.toLocaleString("en-US")} scan${d.scanCount === 1 ? "" : "s"}`}
      </p>

      <div className="tdc__url" title={d.redirectUrl ?? undefined}>
        {d.redirectUrl ?? "No destination set"}
      </div>

      {confirming ? (
        <div className="tdc__confirm">
          <div className="tdc__warn">
            <Icon name="info" size={14} className="tdc__warn-icon" />
            <span>
              <strong>{d.shortSlug}</strong> leaves this workspace and unlinks from{" "}
              {d.establishmentName ?? "your business"}. Its destination{scanNote} reset. The device
              itself is not destroyed scan it and enter the code again whenever you want to set it
              up, here or on a different business.
            </span>
          </div>
          <div className="tdc__confirm-row">
            <button
              type="button"
              className="tdc__btn tdc__btn--ghost"
              onClick={() => setConfirming(false)}
            >
              Keep it
            </button>
            <form action={releaseDevice} className="tdc__form">
              <input type="hidden" name="deviceId" value={d.id} />
              <ReleaseButton />
            </form>
          </div>
        </div>
      ) : (
        <div className="tdc__actions">
          <form action={restoreDevice} className="tdc__form">
            <input type="hidden" name="deviceId" value={d.id} />
            <RestoreButton />
          </form>
          {canRelease && (
            <button
              type="button"
              className="tdc__btn tdc__btn--danger"
              onClick={() => setConfirming(true)}
              aria-label={`Remove ${d.shortSlug} from this workspace`}
            >
              <Icon name="trash" size={13} />
              Remove device
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function RestoreButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="tdc__btn tdc__btn--primary" disabled={pending}>
      <Icon name="arrowR" size={12} />
      {pending ? "Restoring…" : "Restore QR"}
    </button>
  );
}

function ReleaseButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="tdc__btn tdc__btn--danger-solid" disabled={pending}>
      <Icon name="trash" size={13} />
      {pending ? "Removing…" : "Remove device"}
    </button>
  );
}
