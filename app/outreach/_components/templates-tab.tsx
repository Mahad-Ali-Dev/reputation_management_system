import { Icon } from "@/components/shell/icon";
import { withTenant } from "@/lib/db/with-tenant";
import { deleteOutreachTemplate, duplicateOutreachTemplate } from "@/lib/outreach/template-actions";
import { ensureDefaultTemplates } from "@/lib/outreach/seed-default-templates";
import Link from "next/link";

/**
 * Templates library panel (server), rebuilt to the kit mockup
 * (designs/Review Request/templates/{active,empty}): 4 summary cards
 * (Email / SMS / WhatsApp / Most Used), a list toolbar, and full-width template
 * rows with a left accent border, illustration tile, body preview, Used /
 * Reply-rate metric cells, and Edit / Duplicate / Delete actions.
 *
 * LIVE DATA ONLY: Email/SMS counts + total are real. WhatsApp is 0 (the model
 * has no WhatsApp channel). "Most Used" surfaces the default template name (a
 * real signal) since there is no per-OutreachTemplate usage counter — and Used /
 * Reply-rate per row read "—" / "No data yet" (there is no FK from ReviewRequest
 * back to OutreachTemplate to aggregate). This matches the kit's own empty rows.
 *
 * Lazily seeds the two default templates the first time the org has none.
 */
export async function TemplatesTab({ orgId }: { orgId: string }) {
  await ensureDefaultTemplates(orgId);

  const templates = await withTenant(orgId, (tx) =>
    tx.outreachTemplate
      .findMany({
        orderBy: [{ isDefault: "desc" }, { channel: "asc" }, { updatedAt: "desc" }],
        select: {
          id: true,
          name: true,
          channel: true,
          subject: true,
          body: true,
          isDefault: true,
          updatedAt: true,
        },
      })
      .catch(() => []),
  );

  const emailCount = templates.filter((t) => t.channel === "email").length;
  const smsCount = templates.filter((t) => t.channel === "sms").length;
  const whatsappCount = templates.filter((t) => t.channel === "whatsapp").length;
  const mostUsed = templates.find((t) => t.isDefault)?.name ?? templates[0]?.name ?? "—";

  return (
    <div>
      {/* ── Summary cards ── */}
      <div className="rr-sumgrid">
        <SummaryCard
          tone="pri"
          img="/assets/repulabs/review-request/tpl-email.svg"
          label="Email Templates"
          value={String(emailCount)}
          help="All messages"
        />
        <SummaryCard
          tone="blue"
          img="/assets/repulabs/review-request/tpl-sms.svg"
          label="SMS Templates"
          value={String(smsCount)}
          help="Text messages"
        />
        <SummaryCard
          tone="green"
          img="/assets/repulabs/review-request/tpl-whatsapp.svg"
          label="WhatsApp Templates"
          value={String(whatsappCount)}
          help="Chat messages"
        />
        <SummaryCard
          tone="orange"
          img="/assets/repulabs/review-request/tpl-most-used.svg"
          label="Most Used"
          value={mostUsed}
          help={mostUsed === "—" ? "No data yet" : "Default template"}
          small
        />
      </div>

      {/* ── List toolbar ── */}
      <div className="rr-listbar">
        <div className="rr-listbar__title">
          {templates.length} template{templates.length === 1 ? "" : "s"} · reusable email + SMS bodies
        </div>
        <div className="rr-listbar__ctrls">
          <span className="rr-sort">
            Sort by: Latest
            <Icon name="chevD" size={13} />
          </span>
          <div className="rr-viewtoggle" role="group" aria-label="View mode">
            <button type="button" className="is-active" aria-label="List view" aria-pressed="true">
              <Icon name="bars" size={15} />
            </button>
            <button type="button" aria-label="Grid view" aria-pressed="false">
              <Icon name="grid" size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Rows ── */}
      {templates.length === 0 ? (
        <div className="rr-autoempty">
          {/* biome-ignore lint/performance/noImgElement: static brand SVG */}
          <img src="/assets/repulabs/review-request/hero-templates.svg" alt="" aria-hidden="true" />
          <div className="rr-autoempty__title">No templates yet</div>
          <p className="rr-autoempty__body">Create your first template to get started.</p>
          <Link href="/outreach/templates/new" className="btn btn--pri btn--pill">
            <Icon name="plus" size={13} />
            New template
          </Link>
        </div>
      ) : (
        <div className="rr-tpllist">
          {templates.map((t) => (
            <TemplateRow key={t.id} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  tone,
  img,
  label,
  value,
  help,
  small,
}: {
  tone: "pri" | "blue" | "green" | "orange";
  img: string;
  label: string;
  value: string;
  help: string;
  small?: boolean;
}) {
  const tile =
    tone === "pri"
      ? "var(--rr-pri-soft)"
      : tone === "blue"
        ? "var(--rr-blue-soft)"
        : tone === "green"
          ? "var(--rr-green-soft)"
          : "var(--rr-orange-soft)";
  return (
    <div className={`rr-card rr-sumcard rr-sumcard--${tone}`}>
      <div className="rr-sumcard__tile" style={{ background: tile }}>
        {/* biome-ignore lint/performance/noImgElement: static brand SVG */}
        <img src={img} alt="" aria-hidden="true" />
      </div>
      <div className="rr-sumcard__label">{label}</div>
      <div className={small ? "rr-sumcard__value rr-sumcard__value--sm" : "rr-sumcard__value"}>{value}</div>
      <div className="rr-sumcard__help">{help}</div>
      <span className="rr-sumcard__arrow" aria-hidden>
        <Icon name="arrowR" size={14} />
      </span>
    </div>
  );
}

function TemplateRow({
  t,
}: {
  t: {
    id: string;
    name: string;
    channel: string;
    subject: string | null;
    body: string;
    isDefault: boolean;
    updatedAt: Date;
  };
}) {
  const isEmail = t.channel === "email";
  const ill = isEmail
    ? "/assets/repulabs/review-request/tpl-row-email.svg"
    : "/assets/repulabs/review-request/tpl-row-sms.svg";
  return (
    <div className={`rr-card rr-tplrow${isEmail ? "" : " rr-tplrow--sms"}`}>
      <div className="rr-tplrow__ill">
        {/* biome-ignore lint/performance/noImgElement: static brand SVG */}
        <img src={ill} alt="" aria-hidden="true" />
      </div>

      <div style={{ minWidth: 0 }}>
        <div className="rr-tplrow__top">
          <span className={isEmail ? "rr-chip rr-chip--pri" : "rr-chip rr-chip--ok"}>
            {isEmail ? "Email" : "SMS"}
          </span>
          <span className="rr-tplrow__title">{t.name}</span>
          <Icon name="star" size={15} style={{ color: "var(--rr-soft)" }} />
        </div>
        {isEmail && t.subject && <div className="rr-tplrow__subject">Subject: {t.subject}</div>}
        <div className="rr-tplrow__body">{t.body}</div>
        <div className="rr-tplrow__foot">
          {t.isDefault && <span className="rr-chip rr-chip--pri">Default</span>}
          <span style={{ fontSize: 12, color: "var(--rr-muted)", fontWeight: 600 }}>
            {relativeTime(t.updatedAt)}
          </span>
        </div>
      </div>

      <div className="rr-tplrow__metrics">
        <div className="rr-metcell">
          <div className="rr-metcell__label">Used</div>
          <div className="rr-metcell__value">—</div>
          <div className="rr-metcell__help">times</div>
        </div>
        <div className="rr-metcell">
          <div className="rr-metcell__label">Reply rate</div>
          <div className="rr-metcell__value">—</div>
          <div className="rr-metcell__help">No data yet</div>
        </div>
      </div>

      <div className="rr-tplrow__actions">
        <Link href={`/outreach/templates/${t.id}`} className="rr-iconbtn" aria-label={`Edit ${t.name}`}>
          <Icon name="edit" size={15} />
        </Link>
        <form action={duplicateOutreachTemplate}>
          <input type="hidden" name="id" value={t.id} />
          <button type="submit" className="rr-iconbtn" aria-label={`Duplicate ${t.name}`}>
            <Icon name="copy" size={15} />
          </button>
        </form>
        <form action={deleteOutreachTemplate}>
          <input type="hidden" name="id" value={t.id} />
          <button type="submit" className="rr-iconbtn rr-iconbtn--danger" aria-label={`Delete ${t.name}`}>
            <Icon name="trash" size={15} />
          </button>
        </form>
      </div>

      <button type="button" className="rr-rowmenu" aria-label={`${t.name} actions`}>
        <Icon name="grip" size={16} />
      </button>
    </div>
  );
}

function relativeTime(d: Date): string {
  const ms = Date.now() - d.getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}
