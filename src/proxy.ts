import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  response.headers.set("Cache-Control", "private, no-store");
  if (
    process.env.STORE_MODE !== "live" ||
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_PUBLISHABLE_KEY
  )
    return response;
  const auth = createServerClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        response.headers.set("Cache-Control", "private, no-store");
        values.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, {
            ...options,
            httpOnly: true,
            secure:
              (process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL)?.startsWith("https://") ||
              false,
            sameSite: "lax",
          }),
        );
      },
    },
  });
  // Verifica a identidade no Auth e renova a sessão antes de renderizar o painel.
  // A autorização por função continua em requireStaff, usando staff_members.
  await auth.auth.getUser();
  return response;
}
export const config = { matcher: ["/admin/:path*", "/api/admin/:path*", "/entrar"] };
