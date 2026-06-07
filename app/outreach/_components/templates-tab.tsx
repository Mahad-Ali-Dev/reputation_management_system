import { Icon } from "@/components/shell/icon";
import { withTenant } from "@/lib/db/with-tenant";
import { duplicateOutreachTemplate, deleteOutreachTemplate } from "@/lib/outreach/template-actions";
import { ensureDefaultTemplates } from "@/lib/outreach/seed-default-templates";
import Link from "next/link";

/**
 * Templates library panel (server) — card grid. Replaces the old two-column
 * email/SMS form. Each card: name, body preview, channel badge, Default badge,
 * last-edited, and Edit / Duplicate / Delete actions. Edit deep-links to the
 * full-page editor at /outreach/templates/[id].
 *
 * Lazily seeds the two default templates the first time the org has none.
 */
export async function TemplatesTab({ orgId }: { orgId: string }) {
  // Seed defaults (cheap count guard inside; fail-soft).
  await ensureDefaultTemplates(orgId);

  const templates = await withTenant(orgId, (tx) =>
    tx.outreachTemplate
      .findMany({
        orderBy: [{ channel: "asc" }, { isDefault: "desc" }, { updatedAt: "desc" }],
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

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
        <p className="dim" style={{ fontSize: 13 }}>
          {templates.length} template{templates.length === 1 ? "" : "s"} · reusable email + SMS bodies
        </p>
        <Link href="/outreach/templates/new" className="btn btn--pri">
          <Icon name="plus" size={12} />
          New template
        </Link>
      </div>

      {templates.length === 0 ? (
        <div className="ds-card" style={{ padding: 40, textAlign: "center" }}>
          <Icon name="copy" size={28} style={{ color: "var(--pri)", marginBottom: 10 }} />
          <div style={{ fontSize: 15, fontWeight: 500, color: "var(--ink)" }}>No templates yet</div>
          <p className="dim" style={{ marginTop: 6, marginBottom: 16, fontSize: 13 }}>
            Create a reusable email or SMS body with merge tags.
          </p>
          <Link href="/outreach/templates/new" className="btn btn--pri">
            <Icon name="plus" size={12} />
            New template
          </Link>
        </div>
      ) : (
        <div
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}
        >
          {templates.map((t) => (
            <div key={t.id} className="ds-card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: "var(--ink)" }}>{t.name}</div>
                <span className={t.channel === "email" ? "chip chip--info" : "chip chip--ok"}>
                  {t.channel}
                </span>
              </div>
              {t.subject && (
                <div className="dim" style={{ fontSize: 11.5 }}>
                  Subject: {t.subject}
                </div>
              )}
              <p
                className="dim"
                style={{
                  fontSize: 12,
                  lineHeight: 1.5,
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  margin: 0,
                  minHeight: 36,
                }}
              >
                {t.body.slice(0, 140)}
              </p>
              <div
                className="row"
                style={{ justifyContent: "space-between", alignItems: "center", marginTop: "auto" }}
              >
                <div className="row" style={{ gap: 6 }}>
                  {t.isDefault && <span className="chip chip--pri">Default</span>}
                  <span className="dim" style={{ fontSize: 10.5 }}>
                    {relativeTime(t.updatedAt)}
                  </span>
                </div>
                <div className="row" style={{ gap: 4 }}>
                  <Link href={`/outreach/templates/${t.id}`} className="btn" style={{ height: 28, padding: "0 10px" }}>
                    <Icon name="edit" size={11} />
                    Edit
                  </Link>
                  <form action={duplicateOutreachTemplate}>
                    <input type="hidden" name="id" value={t.id} />
                    <button type="submit" className="btn" style={{ height: 28, padding: "0 8px" }} title="Duplicate">
                      <Icon name="copy" size={11} />
                    </button>
                  </form>
                  <form action={deleteOutreachTemplate}>
                    <input type="hidden" name="id" value={t.id} />
                    <button type="submit" className="btn" style={{ height: 28, padding: "0 8px" }} title="Delete">
                      <Icon name="trash" size={11} />
                    </button>
                  </form>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
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
