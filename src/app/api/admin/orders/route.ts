import { z } from "zod";
import { orderStatuses } from "@/lib/models";
import { apiFailure, assertSameOrigin, readBody, requireStaff, rpcFailure } from "@/lib/server";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const staff = await requireStaff();
    const input = z
      .object({ id: z.uuid(), status: z.enum(orderStatuses), payment_received: z.boolean() })
      .parse(await readBody(request));
    const { data, error } = await staff.db.rpc("update_order", {
      p_actor: staff.user_id,
      p_id: input.id,
      p_status: input.status,
      p_paid: input.payment_received,
    });
    if (error) rpcFailure(error.message);
    return Response.json(data);
  } catch (error) {
    return apiFailure(error);
  }
}
