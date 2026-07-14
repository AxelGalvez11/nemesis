import { AccountPortal } from "@/components/AccountPortal";

export default async function AccountBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { checkout } = await searchParams;
  return <AccountPortal section="billing" checkoutStatus={checkout} />;
}
