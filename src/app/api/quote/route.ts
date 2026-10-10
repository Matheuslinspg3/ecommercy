import { calculateQuote } from "@/lib/domain";
import { quoteInputSchema } from "@/lib/models";
import {
  apiFailure,
  assertSameOrigin,
  loadStore,
  readBody,
  rateLimit,
  ApiError,
} from "@/lib/server";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await rateLimit(request, "quote");
    const input = quoteInputSchema.parse(await readBody(request));
    const store = await loadStore();
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
    return Response.json(
      { ...quote, demo: store.demo },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiFailure(error);
  }
}
