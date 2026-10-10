import { productSchema } from "@/lib/models";
import {
  apiFailure,
  assertSameOrigin,
  readBody,
  requireStaff,
  rpcFailure,
  ApiError,
} from "@/lib/server";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const staff = await requireStaff();
    if (staff.role !== "owner") throw new ApiError("Apenas o dono pode editar o catálogo.", 403);
    const body = await readBody(request);
    const product = productSchema.parse({ ...body, reserved_quantity: 0 });
    const { data, error } = await staff.db.rpc("save_product", {
      p_actor: staff.user_id,
      p_product: product,
    });
    if (error) rpcFailure(error.message);
    return Response.json(data);
  } catch (error) {
    return apiFailure(error);
  }
}
