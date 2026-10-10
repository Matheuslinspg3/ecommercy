import { calculateQuote } from "@/lib/domain";
import { orderInputSchema } from "@/lib/models";
import {
  apiFailure,
  assertSameOrigin,
  installation,
  loadStore,
  readBody,
  rateLimit,
  ApiError,
  tokenHash,
  rpcFailure,
} from "@/lib/server";
import { createHmac } from "node:crypto";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await rateLimit(request, "order");
    const input = orderInputSchema.parse(await readBody(request));
    const store = await loadStore();
    if (store.demo) {
      let quote;
      try {
        quote = calculateQuote(
          store.config,
          store.products,
          store.zones,
          input.items,
          input.fulfillment,
          input.cep,
        );
      } catch (error) {
        throw new ApiError(error instanceof Error ? error.message : "Cesta inválida.");
      }
      if (quote.total_cents !== input.expected_total_cents)
        throw new ApiError("O valor mudou. Confira o total novamente.");
      return Response.json({
        demo: true,
        quote,
        message: "Simulação concluída. Nenhum pedido real foi enviado.",
      });
    }
    const { db } = await installation();
    // Token determinístico e secreto: um retry do mesmo pedido recupera o mesmo acesso.
    const signingKey = process.env.ORDER_TOKEN_SECRET;
    if (!signingKey || signingKey.length < 32)
      throw new ApiError("Configure o segredo de acompanhamento desta loja.", 503);
    const tracking = createHmac("sha256", signingKey)
      .update(`order:${store.config.slug}:${input.idempotency_key}`)
      .digest("hex");
    const { data, error } = await db.rpc("create_order", {
      p_input: { ...input, store_slug: store.config.slug },
      p_token_hash: tokenHash(tracking),
    });
    if (error) rpcFailure(error.message);
    return Response.json(
      { demo: false, order: data, tracking_code: `${input.idempotency_key}.${tracking}` },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiFailure(error);
  }
}
