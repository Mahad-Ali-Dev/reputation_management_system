import Link from "next/link";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CouponRedeemForm } from "./form";
import { AppShellServer } from "@/components/app-shell-server";
import { TopBar } from "@/components/topbar";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default async function CouponsPage() {
  const { orgId } = await getOrgContext();

  const [recent, stats] = await Promise.all([
    withTenant(orgId, async (tx) =>
      tx.surveyCoupon.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ),
    withTenant(orgId, async (tx) => {
      const [issued, redeemed, expired] = await Promise.all([
        tx.surveyCoupon.count(),
        tx.surveyCoupon.count({ where: { redeemedAt: { not: null } } }),
        tx.surveyCoupon.count({ where: { redeemedAt: null, expiresAt: { lt: new Date() } } }),
      ]);
      return { issued, redeemed, expired };
    }),
  ]);

  return (
    <AppShellServer topBar={<TopBar title="Survey Coupons" />}>
      <PageHeader
        title="Survey Coupons"
        description="One-time codes issued to promoters."
        breadcrumb={[{"label":"Surveys","href":"/surveys"},{"label":"Coupons"}]}
      />

        
      <div className="space-y-6">
<div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Issued</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{stats.issued}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Redeemed</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{stats.redeemed}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                {stats.issued > 0
                  ? `${((stats.redeemed / stats.issued) * 100).toFixed(0)}% redemption rate`
                  : "—"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Expired unredeemed</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{stats.expired}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Redeem a coupon</CardTitle>
            <CardDescription>
              Customer hands you a code at the counter — enter it here and the system marks it used.
              Codes are single-use.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CouponRedeemForm />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent coupons</CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No coupons issued yet. Enable an incentive on a survey campaign to start.
              </p>
            ) : (
              <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
          <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left py-1">Code</th>
                    <th className="text-left py-1">Value</th>
                    <th className="text-left py-1">Issued</th>
                    <th className="text-left py-1">Expires</th>
                    <th className="text-left py-1">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((c) => {
                    const status = c.redeemedAt
                      ? "redeemed"
                      : c.expiresAt.getTime() < Date.now()
                        ? "expired"
                        : "active";
                    const cls =
                      status === "redeemed"
                        ? "bg-slate-100 text-slate-700"
                        : status === "expired"
                          ? "bg-red-50 text-red-700"
                          : "bg-emerald-50 text-emerald-700";
                    return (
                      <tr key={c.id} className="border-t">
                        <td className="py-2 font-mono text-xs">{c.code}</td>
                        <td>${(c.valueCents / 100).toFixed(2)}</td>
                        <td className="text-xs text-muted-foreground">
                          {new Date(c.createdAt).toLocaleDateString()}
                        </td>
                        <td className="text-xs text-muted-foreground">
                          {new Date(c.expiresAt).toLocaleDateString()}
                        </td>
                        <td>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
                            {status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
        </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShellServer>
  );
}
