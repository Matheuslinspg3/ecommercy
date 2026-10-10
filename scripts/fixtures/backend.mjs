// Somente testes locais. Não é um substituto de Supabase Auth ou PostgREST em produção.
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
export async function startBackend() {
  const db = new PGlite();
  await db.exec(
    "create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key);",
  );
  const migrations = new URL("../../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(migrations)).filter((f) => f.endsWith(".sql")).sort())
    await db.exec(await readFile(new URL(file, migrations), "utf8"));
  const config = JSON.parse(
    await readFile(new URL("../../store.config.json", import.meta.url), "utf8"),
  );
  const secret = "sb_secret_only_local_fixture";
  const publishable = "sb_publishable_only_local_fixture";
  const owner = randomUUID(),
    operator = randomUUID();
  const users = new Map([
    ["owner@example.invalid", { id: owner, email: "owner@example.invalid" }],
    ["operator@example.invalid", { id: operator, email: "operator@example.invalid" }],
  ]);
  const tokens = new Map();
  await db.query("insert into auth.users(id) values($1),($2)", [owner, operator]);
  await db.query(
    "insert into public.staff_members(user_id,role) values($1,'owner'),($2,'operator')",
    [owner, operator],
  );
  await db.query(
    "insert into public.store_installation(slug,config,accepting_orders) values($1,$2::jsonb,true)",
    [config.slug, JSON.stringify(config)],
  );
  const product = "00000000-0000-4000-8000-000000000901";
  await db.query(
    "insert into public.products(id,slug,name,category,price_cents,stock_quantity,options,art) values($1,'prato-fixture','Prato fixture','Teste',2500,10,'[]','meal')",
    [product],
  );
  const calls = {
    create_order: ["p_input", "p_token_hash"],
    save_product: ["p_actor", "p_product"],
    save_settings: ["p_actor", "p_config", "p_accepting", "p_zones"],
    update_order: ["p_actor", "p_id", "p_status", "p_paid"],
    expire_orders: [],
    acquire_rate_limit: ["p_key"],
  };
  const casts = {
    create_order: ["jsonb", "text"],
    save_product: ["uuid", "jsonb"],
    save_settings: ["uuid", "jsonb", "boolean", "jsonb"],
    update_order: ["uuid", "uuid", "text", "boolean"],
    expire_orders: [],
    acquire_rate_limit: ["text"],
  };
  const allowedTables = new Set([
    "store_installation",
    "products",
    "delivery_zones",
    "orders",
    "staff_members",
  ]);
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    function send(status, data) {
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify(data));
    }
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
      if (url.pathname === "/auth/v1/token" && request.method === "POST") {
        const user = users.get(body.email);
        if (!user || body.password !== "LocalTest123!")
          return send(400, { error: "invalid_grant", error_description: "Invalid credentials" });
        const now = Math.floor(Date.now() / 1000);
        const token = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user.id, aud: "authenticated", exp: now + 3600, iat: now, role: "authenticated" })).toString("base64url")}.local-fixture-signature`;
        const profile = {
          ...user,
          aud: "authenticated",
          role: "authenticated",
          app_metadata: {},
          user_metadata: { role: "owner" },
          identities: [],
          created_at: new Date().toISOString(),
        };
        tokens.set(token, profile);
        return send(200, {
          access_token: token,
          token_type: "bearer",
          expires_in: 3600,
          expires_at: now + 3600,
          refresh_token: "local-fixture-refresh",
          user: profile,
        });
      }
      if (url.pathname === "/auth/v1/user") {
        const user = tokens.get(request.headers.authorization?.replace(/^Bearer /, ""));
        return user ? send(200, user) : send(401, { message: "Invalid token" });
      }
      if (url.pathname === "/auth/v1/logout") return send(200, {});
      if (request.headers.authorization !== `Bearer ${secret}`)
        return send(403, { message: "Server key required" });
      const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/)?.[1];
      if (rpc && rpc in calls) {
        const args = calls[rpc].map((k) =>
          typeof body[k] === "object" ? JSON.stringify(body[k]) : body[k],
        );
        const { rows } = await db.query(
          `select public.${rpc}(${args.map((_, i) => `$${i + 1}::${casts[rpc][i]}`).join(",")}) value`,
          args,
        );
        return send(200, rows[0].value);
      }
      const table = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/)?.[1];
      if (!allowedTables.has(table) || request.method !== "GET")
        return send(404, { message: "Unknown fixture request" });
      const { rows: all } = await db.query(`select * from public.${table}`);
      let rows = all;
      for (const [key, value] of url.searchParams)
        if (value.startsWith("eq.") && ["id", "user_id", "token_hash", "active"].includes(key))
          rows = rows.filter((row) => String(row[key]) === value.slice(3));
      const columns = url.searchParams.get("select");
      if (columns && columns !== "*")
        rows = rows.map((row) =>
          Object.fromEntries(columns.split(",").map((key) => [key, row[key]])),
        );
      if (request.headers.accept?.includes("vnd.pgrst.object"))
        return rows.length === 1
          ? send(200, rows[0])
          : send(406, { code: "PGRST116", message: "Not exactly one row" });
      return send(200, rows);
    } catch (error) {
      return send(400, { message: error.message });
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    db,
    secret,
    publishable,
    product,
    config,
    url: `http://127.0.0.1:${server.address().port}`,
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await db.close();
    },
  };
}
