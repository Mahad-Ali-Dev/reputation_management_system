import { getOrgContext } from "@/lib/auth/org-context";
import { prisma } from "@/lib/db/client";

/**
 * Shared settings data loader — reused across the routed settings sub-pages so
 * each page doesn't re-implement the org / membership / settings-blob queries.
 *
 * Preserves the exact data shape the original monolithic account page relied
 * on (org context + plan/createdAt + settings JSON + membership list).
 */

export type SettingsOrg = {
  id: string;
  name: string;
  ownerName: string | null;
  ownerEmail: string | null;
  phone: string | null;
  country: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
  businessDescription: string | null;
  plan: string;
  createdAt: Date;
};

export type SettingsMember = {
  id: string;
  role: string;
  /** Tab whitelist (lib/access/tabs.ts) — empty means unrestricted. */
  allowedTabs: string[];
  user: { name: string | null; email: string | null };
};

export type SettingsBlob = {
  security?: { sessionTimeoutMinutes?: number };
  notifications?: Record<string, { email?: boolean; inApp?: boolean }>;
  api?: {
    keyPrefix?: string;
    keyCreatedAt?: string;
    webhookUrl?: string | null;
    webhookSecret?: string | null;
  };
};

export type SettingsData = {
  org: SettingsOrg;
  members: SettingsMember[];
  sessionUser: { name: string | null; email: string | null };
  settingsObj: SettingsBlob;
};

export async function loadSettingsData(): Promise<SettingsData> {
  const ctx = await getOrgContext();
  const orgId = ctx.orgId;

  const [orgWithCreated, members] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: orgId },
      select: { plan: true, createdAt: true, settings: true },
    }),
    prisma.membership.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { name: true, email: true } } },
    }),
  ]);

  const org: SettingsOrg = {
    id: ctx.org.id,
    name: ctx.org.name,
    ownerName: ctx.org.ownerName,
    ownerEmail: ctx.org.ownerEmail,
    phone: ctx.org.phone,
    country: ctx.org.country,
    websiteUrl: ctx.org.websiteUrl,
    logoUrl: ctx.org.logoUrl,
    businessDescription: ctx.org.businessDescription,
    plan: orgWithCreated?.plan ?? "trial",
    createdAt: orgWithCreated?.createdAt ?? new Date(),
  };

  const settingsObj = (orgWithCreated?.settings as SettingsBlob | null) ?? {};

  return {
    org,
    members,
    sessionUser: { name: ctx.userName, email: ctx.userEmail },
    settingsObj,
  };
}

export function memberRoleLabel(
  members: Array<{ role: string; user: { email: string | null } }>,
  email: string,
): string {
  const me = members.find((m) => m.user.email === email);
  if (!me) return "Member";
  return me.role.charAt(0).toUpperCase() + me.role.slice(1);
}
