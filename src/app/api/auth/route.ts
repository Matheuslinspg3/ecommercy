import { z } from "zod";
import {
  apiFailure,
  assertSameOrigin,
  authClient,
  readBody,
  rateLimit,
  ApiError,
  requireStaff,
} from "@/lib/server";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await rateLimit(request, "login");
    const input = z
      .object({ email: z.email().max(254), password: z.string().min(8).max(200) })
      .parse(await readBody(request));
    const auth = await authClient();
    const { error } = await auth.auth.signInWithPassword(input);
    if (error) throw new ApiError("Email ou senha inválidos.", 401);
    try {
      await requireStaff();
    } catch {
      await auth.auth.signOut();
      throw new ApiError("Conta sem acesso ativo à equipe.", 403);
    }
    return Response.json({ ok: true });
  } catch (error) {
    return apiFailure(error);
  }
}
export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const auth = await authClient();
    await auth.auth.signOut();
    return Response.json({ ok: true });
  } catch (error) {
    return apiFailure(error);
  }
}
