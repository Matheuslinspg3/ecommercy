import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { installationConfig } from "./config";
import { demoProducts } from "./demo";
import {
  productSchema,
  storeConfigSchema,
  zoneSchema,
  type Order,
  type StoreSnapshot,
} from "./models";

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function demoMode() {
  const mode = process.env.STORE_MODE;
  if (mode && !["demo", "live"].includes(mode))
    throw new ApiError("STORE_MODE deve ser demo ou live.", 503);
  if (!mode && (process.env.SUPABASE_URL || process.env.SUPABASE_SECRET_KEY))
    throw new ApiError("Defina STORE_MODE explicitamente antes de conectar um banco.", 503);
  return mode !== "live";
}
export function database() {
  if (demoMode()) throw new ApiError("A demonstração não utiliza banco real.");
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret || !process.env.SUPABASE_PUBLISHABLE_KEY)
    throw new ApiError("Conexão da loja incompleta. Configure o Supabase desta instalação.", 503);
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function installation() {
  const db = database();
  const { data, error } = await db
    .from("store_installation")
    .select("slug,config,accepting_orders")
    .eq("id", true)
    .single();
  if (error || !data) throw new ApiError("A instalação da loja não foi inicializada.", 503);
  if (data.slug !== installationConfig.slug)
    throw new ApiError(
      "O banco conectado pertence a outra instalação. Confira as variáveis da loja.",
      503,
    );
  const config = storeConfigSchema.safeParse(data.config);
  if (!config.success || config.data.slug !== data.slug)
    throw new ApiError("Configuração da instalação inválida.", 503);
  return { db, config: config.data, accepting_orders: !!data.accepting_orders };
}
export async function loadStore(allProducts = false): Promise<StoreSnapshot> {
  if (demoMode())
    return {
      config: installationConfig,
      products: demoProducts(installationConfig.segment),
      zones: installationConfig.demo_delivery_zones,
      demo: true,
      accepting_orders: true,
    };
  const store = await installation();
  let query = store.db.from("products").select("*").order("name");
  if (!allProducts) query = query.eq("active", true);
  const [products, zones] = await Promise.all([
    query,
    store.db.from("delivery_zones").select("*").order("name"),
  ]);
  if (products.error || zones.error)
    throw new ApiError("Não foi possível carregar o catálogo da loja.", 503);
  return {
    config: store.config,
    products: (products.data || []).map((p) => productSchema.parse(p)),
    zones: (zones.data || []).map((z) => zoneSchema.parse(z)),
    demo: false,
    accepting_orders: store.accepting_orders,
  };
}
export async function authClient() {
  database();
  const jar = await cookies();
  return createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (values) => {
        try {
          values.forEach(({ name, value, options }) =>
            jar.set(name, value, {
              ...options,
              httpOnly: true,
              secure: process.env.NEXT_PUBLIC_SITE_URL?.startsWith("https://") || false,
              sameSite: "lax",
            }),
          );
        } catch {
          /* A leitura de sessão no Server Component não modifica cookies. */
        }
      },
    },
  });
}
export async function requireStaff() {
  if (demoMode()) throw new ApiError("O painel demonstrativo é somente leitura.", 403);
  const auth = await authClient();
  const {
    data: { user },
    error,
  } = await auth.auth.getUser();
  if (error || !user) throw new ApiError("Entre com a sua conta da equipe.", 401);
  const store = await installation();
  const { data: staff, error: lookup } = await store.db
    .from("staff_members")
    .select("role,active")
    .eq("user_id", user.id)
    .single();
  if (lookup || !staff?.active)
    throw new ApiError("Esta conta não tem acesso ativo ao painel.", 403);
  return { ...store, user_id: user.id, role: staff.role as "owner" | "operator" };
}
export async function adminOrders(): Promise<Order[]> {
  const staff = await requireStaff();
  const { data, error } = await staff.db
    .from("orders")
    .select(
      "id,number,status,payment_status,fulfillment,total_cents,customer,address,created_at,expires_at,lines",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new ApiError("Não foi possível consultar os pedidos.", 503);
  return data as Order[];
}
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (!origin || !site) throw new ApiError("Origem da solicitação não autorizada.", 403);
  try {
    if (new URL(origin).origin !== new URL(site).origin) throw new Error();
  } catch {
    throw new ApiError("Origem da solicitação não autorizada.", 403);
  }
}
export async function readBody(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new ApiError("Envie JSON.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError("Solicitação vazia.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 50_000) {
      await reader.cancel();
      throw new ApiError("Solicitação muito grande.", 413);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError("JSON inválido.");
  }
}
export function apiFailure(error: unknown) {
  if (error instanceof ApiError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error && typeof error === "object" && "issues" in error)
    return Response.json({ error: "Confira os campos enviados." }, { status: 400 });
  return Response.json(
    { error: "Não foi possível concluir. Tente novamente ou fale com a loja." },
    { status: 500 },
  );
}
const rpcMessages: Record<string, string> = {
  STORE_CLOSED: "A loja está com os pedidos pausados.",
  INVALID_ITEMS: "Confira os itens do pedido.",
  PRODUCT_UNAVAILABLE: "Um produto ficou indisponível.",
  INSUFFICIENT_STOCK: "O estoque de um produto mudou. Revise sua cesta.",
  INVALID_OPTIONS: "Confira os adicionais escolhidos.",
  MINIMUM_ORDER: "O pedido não atingiu o valor mínimo.",
  DELIVERY_UNAVAILABLE: "Esta modalidade ou CEP está indisponível.",
  IDEMPOTENCY_CONFLICT: "Este identificador já foi utilizado para outro pedido.",
  INVALID_TRANSITION: "Esta mudança não é permitida para o estado atual do pedido.",
  ORDER_NOT_FOUND: "Pedido não encontrado.",
  INVALID_STOCK:
    "Preserve o estoque reservado e o modo de estoque dos produtos com pedidos abertos.",
  INSTALLATION_MISMATCH: "O banco não corresponde a esta instalação.",
  PAYMENT_REQUIRED: "Confirme o recebimento do pagamento antes de concluir.",
  ORDER_EXPIRED: "Este pedido expirou. Atualize a lista de pedidos.",
  PRICE_CHANGED: "O valor mudou. Confira o total novamente antes de enviar.",
};
export function rpcFailure(message: string): never {
  for (const [code, label] of Object.entries(rpcMessages))
    if (message.includes(code))
      throw new ApiError(label, code === "IDEMPOTENCY_CONFLICT" ? 409 : 400);
  throw new ApiError("Não foi possível gravar a operação da loja.", 503);
}
export async function rateLimit(request: Request, purpose: string) {
  if (demoMode()) return;
  const { db } = await installation();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const key = createHmac("sha256", process.env.SUPABASE_SECRET_KEY!)
    .update(`${purpose}:${ip}`)
    .digest("hex");
  const { data, error } = await db.rpc("acquire_rate_limit", { p_key: key });
  if (error) throw new ApiError("Não foi possível validar a solicitação.", 503);
  if (!data) throw new ApiError("Muitas solicitações. Aguarde um minuto.", 429);
}
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export function cronAuthorized(value: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32 || !value) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const supplied = Buffer.from(value);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}
