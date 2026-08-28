import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getOrgContext } from "@/lib/auth/org-context";
import { getOrder } from "@/lib/hardware/queries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AppShellServer } from "@/components/app-shell-server";
import { TopBar } from "@/components/topbar";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { id } = await params;
  const { orgId } = await getOrgContext();

  const order = await getOrder(orgId, id);
  if (!order) notFound();
  const sp = await searchParams;

  const addr = order.shippingAddress as {
    name?: string; line1?: string; line2?: string; city?: string; region?: string; postal?: string; country?: string;
  } | null;

  return (
    <AppShellServer topBar={<TopBar title="Hardware Order" />}>
      <PageHeader
        title="Hardware Order"
        breadcrumb={[{"label":"Review Stands","href":"/hardware"},{"label":"Order"}]}
      />

      <div className="space-y-6">
        {sp.status === "success" && (
          <div className="rounded-md bg-emerald-50 p-4 text-sm text-emerald-900">
            ✓ Payment received. We've started preparing your order check your email for the
            shipment notification, then follow the activation card in the box.
          </div>
        )}

        <div>
          <h1 className="text-2xl font-bold tracking-tight">Order #{order.id.slice(0, 8)}</h1>
          <p className="text-muted-foreground capitalize">{order.status}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Items</CardTitle>
          </CardHeader>
          <CardContent>
            {order.items.map((item) => (
              <div key={item.id} className="flex justify-between text-sm">
                <span>
                  {item.quantity}× {item.product.name}
                </span>
                <span>
                  ${((item.unitPriceCents * item.quantity) / 100).toFixed(2)} {order.currency}
                </span>
              </div>
            ))}
            <div className="mt-3 border-t pt-3 flex justify-between font-semibold">
              <span>Total</span>
              <span>${(order.totalCents / 100).toFixed(2)} {order.currency}</span>
            </div>
          </CardContent>
        </Card>

        {addr && Object.keys(addr).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Shipping</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {addr.name && <div>{addr.name}</div>}
              {addr.line1 && <div>{addr.line1}</div>}
              {addr.line2 && <div>{addr.line2}</div>}
              <div>
                {[addr.city, addr.region, addr.postal].filter(Boolean).join(", ")}
              </div>
              {addr.country && <div>{addr.country}</div>}
              {order.trackingNumber && (
                <div className="mt-3">
                  <strong>Tracking:</strong> {order.carrier} {order.trackingNumber}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Devices ({order.devices.length})</CardTitle>
            <CardDescription>
              Each device gets a unique QR + activation code. Activation card ships in the
              package.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {order.devices.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Devices will be provisioned once payment is confirmed.
              </p>
            ) : (
              <div className="space-y-2">
                {order.devices.map((d) => (
                  <div key={d.id} className="flex justify-between rounded-md border bg-white p-2 text-sm">
                    <code>{d.shortSlug}</code>
                    <span className="capitalize text-muted-foreground">{d.status}</span>
                  </div>
                ))}
                <div className="pt-2">
                  <Button asChild size="sm">
                    <Link href="/activate">Activate a device →</Link>
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShellServer>
  );
}
