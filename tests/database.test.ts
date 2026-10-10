import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { installationConfig } from "../src/lib/config";
import { demoProducts } from "../src/lib/demo";
import { calculateQuote } from "../src/lib/domain";
let db: PGlite;
const owner = randomUUID();
const operator = randomUUID();
const product = { ...demoProducts("restaurant")[0], stock_quantity: 5 };
const second = { ...demoProducts("restaurant")[1], stock_quantity: 10 };
const hash = "a".repeat(64);
async function rpc(name: string, values: unknown[], casts: string[]) {
  const r = await db.query<{ value: unknown }>(
    `select public.${name}(${values.map((_, i) => `$${i + 1}::${casts[i]}`).join(",")}) value`,
    values,
  );
  return r.rows[0].value;
}
function input(overrides: Record<string, unknown> = {}) {
  return {
    idempotency_key: randomUUID(),
    store_slug: installationConfig.slug,
    items: [{ product_id: product.id, quantity: 1, option_ids: [] }],
    fulfillment: "pickup",
    cep: "",
    name: "Cliente de teste",
    phone: "11999999999",
    address: "",
    privacy_consent: true,
    expected_total_cents: 2890,
    ...overrides,
  };
}
const create = (body: unknown) =>
  rpc("create_order", [JSON.stringify(body), hash], ["jsonb", "text"]);
const update = (id: string, status: string, paid = false, actor = owner) =>
  rpc("update_order", [actor, id, status, paid], ["uuid", "uuid", "text", "boolean"]);
const stock = async () =>
  (
    await db.query<{ stock_quantity: number; reserved_quantity: number }>(
      "select stock_quantity,reserved_quantity from public.products where id=$1",
      [product.id],
    )
  ).rows[0];
before(async () => {
  db = new PGlite();
  await db.exec(
    "create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key);",
  );
  const root = new URL("../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(root)).filter((f) => f.endsWith(".sql")).sort())
    await db.exec(await readFile(new URL(file, root), "utf8"));
  await db.query("insert into auth.users(id) values($1),($2)", [owner, operator]);
});
beforeEach(async () => {
  await db.exec(
    "reset role; truncate public.audit_events,public.orders,public.products,public.delivery_zones,public.store_installation,public.staff_members,public.api_rate_limits restart identity;",
  );
  await db.query(
    "insert into public.staff_members(user_id,role) values($1,'owner'),($2,'operator')",
    [owner, operator],
  );
  await db.query(
    "insert into public.store_installation(slug,config,accepting_orders) values($1,$2::jsonb,true)",
    [installationConfig.slug, JSON.stringify(installationConfig)],
  );
  for (const p of [product, second])
    await rpc("save_product", [owner, JSON.stringify(p)], ["uuid", "jsonb"]);
  const zone = installationConfig.demo_delivery_zones[0];
  await db.query(
    "insert into public.delivery_zones(id,name,cep_start,cep_end,fee_cents,free_from_cents,enabled) values($1,$2,$3,$4,$5,$6,true)",
    [zone.id, zone.name, zone.cep_start, zone.cep_end, zone.fee_cents, zone.free_from_cents],
  );
});
after(async () => {
  await db.close();
});
test("todas as tabelas têm RLS e clientes não acessam dados nem RPCs", async () => {
  const tables = await db.query<{ rls: boolean }>(
    "select relrowsecurity rls from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r'",
  );
  assert.equal(tables.rows.length, 7);
  assert.ok(tables.rows.every((t) => t.rls));
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    await assert.rejects(() => db.query("select * from public.orders"), /permission denied/);
    await assert.rejects(() => create(input()), /permission denied/);
    await db.exec("reset role");
  }
});
test("papel de servidor tem os privilégios necessários", async () => {
  await db.exec("set role service_role");
  await create(input());
  assert.equal((await stock()).reserved_quantity, 1);
  await db.exec("reset role");
});
test("banco recalcula preço, adicionais e frete com paridade à cotação", async () => {
  const items = [{ product_id: product.id, quantity: 2, option_ids: ["queijo-extra"] }];
  const quote = calculateQuote(
    installationConfig,
    [product],
    installationConfig.demo_delivery_zones,
    items,
    "delivery",
    "01001000",
  );
  const order = (await create(
    input({
      items,
      fulfillment: "delivery",
      cep: "01001000",
      address: "Rua Teste, 123, Centro",
      expected_total_cents: quote.total_cents,
      price_cents: 1,
    }),
  )) as { total_cents: number };
  assert.equal(order.total_cents, 6880);
  assert.equal(order.total_cents, quote.total_cents);
  assert.deepEqual(await stock(), { stock_quantity: 5, reserved_quantity: 2 });
});
test("total adulterado ou preço alterado causa rollback completo", async () => {
  await assert.rejects(() => create(input({ expected_total_cents: 1 })), /PRICE_CHANGED/);
  assert.equal((await stock()).reserved_quantity, 0);
  await db.query("update public.products set price_cents=3000 where id=$1", [product.id]);
  await assert.rejects(() => create(input()), /PRICE_CHANGED/);
  assert.equal((await stock()).reserved_quantity, 0);
});
test("retry retorna o pedido anterior sem outra reserva, mesmo após pausar a loja", async () => {
  const body = input();
  const first = await create(body);
  await db.exec("update public.store_installation set accepting_orders=false");
  assert.deepEqual(await create(body), first);
  assert.equal((await stock()).reserved_quantity, 1);
  await assert.rejects(() => create({ ...body, name: "Outro cliente" }), /IDEMPOTENCY_CONFLICT/);
});
test("identidade de outra instalação e loja pausada bloqueiam pedidos novos", async () => {
  await assert.rejects(() => create(input({ store_slug: "outra-loja" })), /INSTALLATION_MISMATCH/);
  await db.exec("update public.store_installation set accepting_orders=false");
  await assert.rejects(() => create(input()), /STORE_CLOSED/);
});
test("estoque insuficiente faz rollback de todas as linhas", async () => {
  await assert.rejects(
    () =>
      create(
        input({
          items: [
            { product_id: product.id, quantity: 2, option_ids: [] },
            { product_id: second.id, quantity: 11, option_ids: [] },
          ],
        }),
      ),
    /INSUFFICIENT_STOCK/,
  );
  assert.equal((await stock()).reserved_quantity, 0);
});
test("duas personalizações do mesmo produto não contornam o estoque", async () => {
  await assert.rejects(
    () =>
      create(
        input({
          items: [
            { product_id: product.id, quantity: 3, option_ids: [] },
            { product_id: product.id, quantity: 3, option_ids: ["queijo-extra"] },
          ],
        }),
      ),
    /INSUFFICIENT_STOCK/,
  );
  assert.equal((await stock()).reserved_quantity, 0);
});
test("pedidos sequenciais disputando a última unidade não geram sobre-reserva", async () => {
  await db.query("update public.products set stock_quantity=1 where id=$1", [product.id]);
  await create(input());
  await assert.rejects(() => create(input()), /INSUFFICIENT_STOCK/);
  assert.equal((await stock()).reserved_quantity, 1);
});
test("adicionais desconhecidos, repetidos e obrigatórios são validados no banco", async () => {
  for (const option_ids of [["invalid"], ["queijo-extra", "queijo-extra"]])
    await assert.rejects(
      () => create(input({ items: [{ product_id: product.id, quantity: 1, option_ids }] })),
      /INVALID_OPTIONS/,
    );
  await db.query("update public.products set options=$1::jsonb where id=$2", [
    JSON.stringify([{ ...product.options[0], min: 1, max: 1 }]),
    product.id,
  ]);
  await assert.rejects(() => create(input()), /INVALID_OPTIONS/);
  assert.equal((await stock()).reserved_quantity, 0);
});
test("restrições de medicamentos não dependem da interface", async () => {
  for (const sale_class of ["prescription", "controlled", "otc"]) {
    await db.query(
      "update public.products set sale_class=$1,warning='Advertência de teste' where id=$2",
      [sale_class, product.id],
    );
    await assert.rejects(() => create(input()), /PRODUCT_UNAVAILABLE/);
  }
});
test("dados obrigatórios ausentes são rejeitados mesmo em chamada direta ao RPC", async () => {
  const body = input();
  delete (body as Record<string, unknown>).name;
  await assert.rejects(() => create(body), /INVALID_ITEMS/);
});
test("expiração libera somente reservas pendentes, uma única vez", async () => {
  const body = input();
  await create(body);
  await db.query("update public.orders set expires_at=now()-interval '1 minute' where id=$1", [
    body.idempotency_key,
  ]);
  await assert.rejects(() => update(body.idempotency_key, "accepted"), /ORDER_EXPIRED/);
  assert.equal(await rpc("expire_orders", [], []), 1);
  assert.equal(await rpc("expire_orders", [], []), 0);
  assert.deepEqual(await stock(), { stock_quantity: 5, reserved_quantity: 0 });
});
test("fluxo de retirada exige pagamento conferido e consome estoque uma vez", async () => {
  const body = input();
  await create(body);
  await update(body.idempotency_key, "accepted");
  await update(body.idempotency_key, "preparing");
  await assert.rejects(
    () => update(body.idempotency_key, "out_for_delivery"),
    /INVALID_TRANSITION/,
  );
  await update(body.idempotency_key, "ready_for_pickup");
  await assert.rejects(() => update(body.idempotency_key, "completed"), /PAYMENT_REQUIRED/);
  await update(body.idempotency_key, "completed", true);
  await update(body.idempotency_key, "completed", true);
  assert.deepEqual(await stock(), { stock_quantity: 4, reserved_quantity: 0 });
  await assert.rejects(() => update(body.idempotency_key, "canceled"), /INVALID_TRANSITION/);
});
test("cancelamento libera a reserva sem somar estoque físico", async () => {
  const body = input();
  await create(body);
  await update(body.idempotency_key, "canceled");
  await update(body.idempotency_key, "canceled");
  assert.deepEqual(await stock(), { stock_quantity: 5, reserved_quantity: 0 });
});
test("operador atualiza pedidos mas não altera produtos/configurações; conta inativa é bloqueada", async () => {
  const body = input();
  await create(body);
  await update(body.idempotency_key, "accepted", false, operator);
  await assert.rejects(
    () => rpc("save_product", [operator, JSON.stringify(product)], ["uuid", "jsonb"]),
    /OWNER_REQUIRED/,
  );
  await assert.rejects(
    () =>
      rpc(
        "save_settings",
        [operator, JSON.stringify(installationConfig), true, "[]"],
        ["uuid", "jsonb", "boolean", "jsonb"],
      ),
    /OWNER_REQUIRED/,
  );
  await db.query("update public.staff_members set active=false where user_id=$1", [operator]);
  await assert.rejects(
    () => update(body.idempotency_key, "preparing", false, operator),
    /STAFF_REQUIRED/,
  );
});
test("editar produto não apaga reservas nem permite mudar seu modo de estoque com pedidos abertos", async () => {
  await create(input());
  await rpc(
    "save_product",
    [owner, JSON.stringify({ ...product, price_cents: 3000 })],
    ["uuid", "jsonb"],
  );
  assert.equal((await stock()).reserved_quantity, 1);
  for (const stock_quantity of [0, null])
    await assert.rejects(
      () =>
        rpc(
          "save_product",
          [owner, JSON.stringify({ ...product, stock_quantity })],
          ["uuid", "jsonb"],
        ),
      /INVALID_STOCK/,
    );
});
test("limite de solicitações é contado no banco e nega excesso", async () => {
  for (let n = 0; n < 12; n++)
    assert.equal(await rpc("acquire_rate_limit", [hash], ["text"]), true);
  assert.equal(await rpc("acquire_rate_limit", [hash], ["text"]), false);
});
