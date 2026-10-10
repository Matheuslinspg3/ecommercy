import { apiFailure, assertSameOrigin, requireStaff, rpcFailure } from "@/lib/server";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const staff = await requireStaff();
    const { data, error } = await staff.db.rpc("expire_orders");
    if (error) rpcFailure(error.message);
    return Response.json({ released: data });
  } catch (error) {
    return apiFailure(error);
  }
}
