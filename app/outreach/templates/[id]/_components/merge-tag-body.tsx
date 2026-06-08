"use client";

import { MergeTagEditor } from "@/components/merge-tag/merge-tag-editor";
import { OUTREACH_MERGE_TAGS, outreachValues, sampleContext } from "@/lib/outreach/merge-tags";

/**
 * Merge-tag body field for the Template Editor.
 *
 * Thin wrapper over the Wave-0 `MergeTagEditor` primitive (single engine,
 * canonical double-brace `{{tag}}`, chips insert at cursor, char counter, SMS
 * segment hint). Configured with the outreach tag set so authors see
 * {{first_name}} … {{establishment_address}}.
 *
 * We disable the primitive's built-in side-preview (`showPreview={false}`) because
 * the Template Editor renders its own richer recipient-style preview (logo +
 * subject + CTA + footer) in the right column.
 */
export function MergeTagBody({
  value,
  onChange,
  channel,
  businessName,
  sampleAddress,
  maxLength,
}: {
  value: string;
  onChange: (next: string) => void;
  channel: "email" | "sms";
  businessName: string;
  sampleAddress: string;
  maxLength?: number;
}) {
  // Sample data drives the primitive's char counter rendering.
  const sampleData = outreachValues(sampleContext(businessName, sampleAddress));

  return (
    <MergeTagEditor
      value={value}
      onChange={onChange}
      tags={OUTREACH_MERGE_TAGS}
      sampleData={sampleData}
      channel={channel}
      label="Body"
      maxLength={maxLength}
      showPreview={false}
    />
  );
}
