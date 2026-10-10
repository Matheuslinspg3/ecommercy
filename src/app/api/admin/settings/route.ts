import { z } from "zod";
import { storeConfigSchema, zoneSchema } from "@/lib/models";
import {
  apiFailure,
  assertSameOrigin,
  readBody,
  requireStaff,
  ApiError,
  rpcFailure,
} from "@/lib/server";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const staff = await requireStaff();
    if (staff.role !== "owner") throw new ApiError("Apenas o dono pode configurar a loja.", 403);
    const input = z
      .object({
        config: storeConfigSchema,
        accepting_orders: z.boolean(),
        zones: z.array(zoneSchema).max(30),
      })
      .parse(await readBody(request));
    if (input.config.slug !== staff.config.slug)
      throw new ApiError("A identidade desta instalação não pode ser alterada.");
    if (new Set(input.zones.map((z) => z.id)).size !== input.zones.length)
      throw new ApiError("Há zonas de entrega repetidas.");
    const { data, error } = await staff.db.rpc("save_settings", {
      p_actor: staff.user_id,
      p_config: input.config,
      p_accepting: input.accepting_orders,
      p_zones: input.zones,
    });
    if (error) rpcFailure(error.message);
    return Response.json(data);
  } catch (error) {
    return apiFailure(error);
  }
}
