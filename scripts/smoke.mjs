import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { startBackend } from "./fixtures/backend.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const servers = [];
let backend;
let browser;
async function start(port, env) {
  const url = `http://localhost:${port}`;
  let logs = "";
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url)),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: root,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_SITE_URL: url, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  servers.push(child);
  child.stdout.on("data", (d) => {
    logs += d;
  });
  child.stderr.on("data", (d) => {
    logs += d;
  });
  for (let n = 0; n < 100; n++) {
    if (child.exitCode !== null) throw new Error(`Servidor de teste falhou: ${logs.slice(-1200)}`);
    try {
      const r = await fetch(url);
      if (r.status === 200) return url;
    } catch {
      /* Aguarda inicialização. */
    }
    await delay(100);
  }
  throw new Error(`Servidor não iniciou: ${logs.slice(-1200)}`);
}
async function post(base, path, body, cookie = "") {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: base,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, data: await response.json(), response };
}
try {
  const demo = await start(3100, {
    STORE_MODE: "demo",
    SUPABASE_URL: "",
    SUPABASE_SECRET_KEY: "",
    SUPABASE_PUBLISHABLE_KEY: "",
  });
  const home = await (await fetch(demo)).text();
  assert.ok(home.includes("Demonstração"));
  assert.ok(home.includes("Mesa Local"));
  const items = [
    {
      product_id: "00000000-0000-4000-8000-000000000001",
      quantity: 1,
      option_ids: ["queijo-extra"],
    },
  ];
  const quote = await post(demo, "/api/quote", { items, fulfillment: "pickup", cep: "" });
  assert.equal(quote.status, 200);
  assert.equal(quote.data.total_cents, 3190);
  const simulated = await post(demo, "/api/orders", {
    items,
    fulfillment: "pickup",
    cep: "",
    idempotency_key: randomUUID(),
    expected_total_cents: 3190,
    name: "Cliente Teste",
    phone: "11999999999",
    address: "",
    privacy_consent: true,
  });
  assert.equal(simulated.status, 200);
  assert.equal(simulated.data.demo, true);
  assert.equal(simulated.data.order, undefined);
  const denied = await fetch(`${demo}/api/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(denied.status, 403);
  assert.equal((await post(demo, "/api/admin/settings", {})).status, 403);
  backend = await startBackend();
  const live = await start(3101, {
    STORE_MODE: "live",
    SUPABASE_URL: backend.url,
    SUPABASE_SECRET_KEY: backend.secret,
    SUPABASE_PUBLISHABLE_KEY: backend.publishable,
    ORDER_TOKEN_SECRET: "local-tracking-test-secret-32-characters",
    CRON_SECRET: "local-cron-test-secret-32-characters",
  });
  const liveHtml = await (await fetch(live)).text();
  assert.ok(liveHtml.includes("Prato fixture"));
  assert.ok(!liveHtml.includes("catálogo de exemplo"));
  assert.ok(!liveHtml.includes(backend.secret));
  assert.equal((await post(live, "/api/admin/products", {})).status, 401);
  const liveItems = [{ product_id: backend.product, quantity: 1, option_ids: [] }];
  const key = randomUUID();
  const body = {
    items: liveItems,
    fulfillment: "pickup",
    cep: "",
    idempotency_key: key,
    expected_total_cents: 2500,
    name: "Cliente Teste",
    phone: "11999999999",
    address: "",
    privacy_consent: true,
  };
  const realOrder = await post(live, "/api/orders", body);
  assert.equal(realOrder.status, 200);
  assert.equal(realOrder.data.demo, false);
  assert.equal(realOrder.data.order.total_cents, 2500);
  const repeated = await post(live, "/api/orders", body);
  assert.equal(repeated.status, 200);
  assert.equal(repeated.data.order.id, realOrder.data.order.id);
  assert.equal(repeated.data.tracking_code, realOrder.data.tracking_code);
  const tracked = await post(live, "/api/track", { code: realOrder.data.tracking_code });
  assert.equal(tracked.status, 200);
  assert.equal(tracked.data.customer, undefined);
  assert.equal(tracked.data.address, undefined);
  assert.equal(tracked.data.status, "pending");
  assert.equal((await post(live, "/api/track", { code: `${key}.${"b".repeat(64)}` })).status, 404);
  const login = await post(live, "/api/auth", {
    email: "operator@example.invalid",
    password: "LocalTest123!",
  });
  assert.equal(login.status, 200);
  const cookie = login.response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  assert.ok(cookie);
  // A fixture retorna user_metadata.role=owner; a autorização deve usar a tabela operator.
  assert.equal((await post(live, "/api/admin/settings", {}, cookie)).status, 403);
  assert.equal((await post(live, "/api/admin/products", {}, cookie)).status, 403);
  assert.equal(
    (
      await post(
        live,
        "/api/admin/orders",
        { id: key, status: "accepted", payment_received: false },
        cookie,
      )
    ).status,
    200,
  );
  const ownerLogin = await post(live, "/api/auth", {
    email: "owner@example.invalid",
    password: "LocalTest123!",
  });
  assert.equal(ownerLogin.status, 200);
  const ownerCookie = ownerLogin.response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  assert.equal(
    (
      await post(
        live,
        "/api/admin/settings",
        {
          config: { ...backend.config, name: "Loja configurada" },
          zones: [],
          accepting_orders: false,
        },
        ownerCookie,
      )
    ).status,
    200,
  );
  const configured = await (await fetch(live)).text();
  assert.ok(configured.includes("Loja configurada"));
  assert.ok(configured.includes("Pedidos pausados"));
  assert.equal(
    (await post(live, "/api/orders", { ...body, idempotency_key: randomUUID() })).status,
    400,
  );
  const record = (
    await backend.db.query(
      "select stock_quantity,reserved_quantity from public.products where id=$1",
      [backend.product],
    )
  ).rows[0];
  assert.deepEqual(record, { stock_quantity: 10, reserved_quantity: 1 });
  await backend.db.query(
    "update public.store_installation set slug='wrong-installation',config=jsonb_set(config,'{slug}','\"wrong-installation\"') where id=true",
  );
  assert.equal(
    (await post(live, "/api/quote", { items: liveItems, fulfillment: "pickup", cep: "" })).status,
    503,
  );
  console.log(
    "HTTP aprovado: demo/live local, valores, pedidos persistidos, retry, acompanhamento, Auth/equipe, configuração e identidade do banco.",
  );
  if (!process.argv.includes("--http-only")) {
    const { chromium } = await import("playwright");
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(demo);
    await page.getByRole("button", { name: "Adicionar Bowl da casa", exact: true }).click();
    await page.getByLabel(/Queijo extra/).check();
    await page.getByRole("button", { name: /Adicionar à cesta/ }).click();
    await page.getByRole("button", { name: "Abrir cesta, 1 itens", exact: true }).click();
    await page.getByRole("button", { name: /Conferir total e frete/ }).click();
    await page.locator('input[name="name"]').fill("Cliente Teste");
    await page.locator('input[name="phone"]').fill("11999999999");
    await page.locator('input[name="consent"]').check();
    await page.getByRole("button", { name: /Simular pedido/ }).click();
    await page.getByRole("heading", { name: "Simulação concluída" }).waitFor();
    await page.getByRole("button", { name: "Continuar escolhendo", exact: true }).click();
    await mkdir(`${root}/test-results`, { recursive: true });
    await page.screenshot({ path: `${root}/test-results/desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 360, height: 800 });
    await page.getByRole("textbox", { name: "Buscar produtos" }).fill("sobremesa");
    assert.equal(await page.locator(".product-card").count(), 1);
    await page.getByRole("button", { name: /Ver todos os produtos/ }).click();
    assert.equal(await page.locator(".product-card").count(), 6);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.screenshot({ path: `${root}/test-results/mobile.png`, fullPage: true });
    await page.goto(`${demo}/admin`);
    await page.getByRole("button", { name: "Minha loja", exact: true }).click();
    await page.getByRole("heading", { name: "Identidade e atendimento" }).waitFor();
    assert.equal(
      await page.getByRole("button", { name: "Salvar configurações" }).isDisabled(),
      true,
    );
    assert.deepEqual(errors, []);
    console.log(
      "Navegador aprovado: desktop/celular, adicionais, carrinho, checkout demonstrativo, filtros, ausência de overflow e painel.",
    );
  }
} finally {
  if (browser) await browser.close();
  for (const server of servers) {
    server.kill("SIGTERM");
  }
  await Promise.all(
    servers.map((server) =>
      server.exitCode !== null
        ? Promise.resolve()
        : new Promise((resolve) => server.once("exit", resolve)),
    ),
  );
  if (backend) await backend.close();
}
