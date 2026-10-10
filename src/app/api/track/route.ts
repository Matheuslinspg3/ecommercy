import { z } from "zod";
import {
  apiFailure,
  assertSameOrigin,
  installation,
  demoMode,
  readBody,
  rateLimit,
  ApiError,
  tokenHash,
} from "@/lib/server";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await rateLimit(request, "track");
    if (demoMode()) throw new ApiError("A demonstração não possui pedidos reais.");
    const { code } = z
      .object({ code: z.string().regex(/^[a-f0-9-]{36}\.[a-f0-9]{64}$/) })
      .parse(await readBody(request));
    const [id, token] = code.split(".");
    const { db } = await installation();
    const { data, error } = await db
      .from("orders")
      .select("number,status,payment_status,total_cents,fulfillment,lines")
      .eq("id", id)
      .eq("token_hash", tokenHash(token))
      .maybeSingle();
    if (error) throw new ApiError("Não foi possível consultar o pedido.", 503);
    if (!data) throw new ApiError("Código de acompanhamento inválido.", 404);
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiFailure(error);
  }
}
