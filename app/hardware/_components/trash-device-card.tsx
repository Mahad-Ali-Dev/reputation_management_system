"use client";

import { Icon } from "@/components/shell/icon";
import { permanentlyDeleteDevice, restoreDevice } from "@/lib/hardware/actions";
import { useState } from "react";
import { useFormStatus } from "react-dom";

/**
 * One card in My Devices → Trash.
 *
 * Client-side because "Delete forever" is irreversible and must not be a single
 * click. The destructive action is disclosed in two steps: the card flips into
 * a confirm state that spells out exactly what is lost — the QR slug is freed,
 * so a plaque already printed with it dies permanently — and only then offers
 * the real button. Restore stays a one-click primary action, because it is the
 * safe path and the one people are here for.
 *
 * Both buttons post to server actions; nothing about the delete is decided on
 * the client (permanentlyDeleteDevice re-checks role and that the row is
 * actually retired).
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
  canPurge,
}: {
  device: TrashCardDevice;
  /** Only admins/owners may destroy a device — see permanentlyDeleteDevice. */
  canPurge: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className={confirming ? "tdc tdc--confirming" : "tdc"}>
      <div className="tdc__top">
        <span className="tdc__code">{d.shortSlug}</span>
        <span className="tdc__pill">In trash</span>
      </div>

      <h3 className="tdc__name">{d.establishmentName ?? "Unassigned"}</h3>
      <p className="tdc__meta">
        {d.productSku} · added {new Date(d.createdAt).toLocaleDateString()}
        {d.scanCount > 0 && ` · ${d.scanCount.toLocaleString("en-US")} scans`}
      </p>

      <div className="tdc__url" title={d.redirectUrl ?? undefined}>
        {d.redirectUrl ?? "No destination set"}
      </div>

      {confirming ? (
        <div className="tdc__confirm">
          <div className="tdc__warn">
            <Icon name="info" size={14} className="tdc__warn-icon" />
            <span>
              This cannot be undone. The QR code <code>{d.shortSlug}</code> is freed and any plaque
              already printed with it stops working for good
              {d.scanCount > 0
                ? `, and its ${d.scanCount.toLocaleString("en-US")} scans leave your analytics`
                : ""}
              .
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
            <form action={permanentlyDeleteDevice} style={{ flex: 1 }}>
              <input type="hidden" name="deviceId" value={d.id} />
              <PurgeButton />
            </form>
          </div>
        </div>
      ) : (
        <div className="tdc__actions">
          <form action={restoreDevice} style={{ flex: 1 }}>
            <input type="hidden" name="deviceId" value={d.id} />
            <RestoreButton />
          </form>
          {canPurge && (
            <button
              type="button"
              className="tdc__btn tdc__btn--danger"
              onClick={() => setConfirming(true)}
              aria-label={`Delete ${d.shortSlug} permanently`}
            >
              <Icon name="trash" size={13} />
              Delete forever
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

function PurgeButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="tdc__btn tdc__btn--danger-solid" disabled={pending}>
      <Icon name="trash" size={13} />
      {pending ? "Deleting…" : "Delete forever"}
    </button>
  );
}
