import { apiFailure, installation, cronAuthorized, ApiError, rpcFailure } from "@/lib/server";
export async function GET(request: Request) {
  try {
    if (!cronAuthorized(request.headers.get("authorization")))
      throw new ApiError("Não autorizado.", 401);
    const { db } = await installation();
    const { data, error } = await db.rpc("expire_orders");
    if (error) rpcFailure(error.message);
    return Response.json({ released: data });
  } catch (error) {
    return apiFailure(error);
  }
}
