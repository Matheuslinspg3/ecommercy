import { redirect } from "next/navigation";
import { AdminWorkspace } from "@/components/admin-workspace";
import { adminOrders, ApiError, demoMode, loadStore, requireStaff } from "@/lib/server";
export default async function AdminPage() {
  if (demoMode())
    return <AdminWorkspace initial={await loadStore(true)} orders={[]} role="owner" />;
  let role: "owner" | "operator";
  try {
    role = (await requireStaff()).role;
  } catch (error) {
    if (error instanceof ApiError && [401, 403].includes(error.status)) redirect("/entrar");
    throw error;
  }
  const [initial, orders] = await Promise.all([loadStore(true), adminOrders()]);
  return <AdminWorkspace initial={initial} orders={orders} role={role} />;
}
