import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { calculateQuote, canSell, lineKey, unitPrice } from "../src/lib/domain";
import { demoProducts } from "../src/lib/demo";
import { installationConfig } from "../src/lib/config";
import { orderInputSchema, productSchema, storeConfigSchema } from "../src/lib/models";
const config = installationConfig;
const products = demoProducts(config.segment);
const baseLine = { product_id: products[0].id, quantity: 1, option_ids: [] };
test("todos os cinco perfis são configurações completas e utilizam catálogo próprio", async () => {
  for (const segment of ["restaurant", "snack_bar", "grocery", "pharmacy", "retail"] as const) {
    const preset = storeConfigSchema.parse(
      JSON.parse(
        await readFile(new URL(`../config/presets/${segment}.json`, import.meta.url), "utf8"),
      ),
    );
    assert.equal(preset.segment, segment);
    assert.equal(preset.branding.logo, "");
    assert.equal(preset.contact.whatsapp, "");
    assert.ok(demoProducts(segment).every((p) => productSchema.safeParse(p).success));
  }
});
test("adicionais são somados por unidade e opções inválidas são rejeitadas", () => {
  assert.equal(unitPrice(products[0], ["queijo-extra", "molho-casa"]), 3390);
  assert.throws(() => unitPrice(products[0], ["queijo-extra", "queijo-extra"]), /repetido/);
  assert.throws(() => unitPrice(products[0], ["inventado"]), /indisponível/);
});
test("opções obrigatórias não podem ser omitidas", () => {
  const p = { ...products[0], options: [{ ...products[0].options[0], min: 1, max: 1 }] };
  assert.throws(() => unitPrice(p, []), /Escolha/);
  assert.throws(() => unitPrice(p, ["queijo-extra", "molho-casa"]), /Escolha/);
});
test("identidade da linha diferencia personalizações e ignora a ordem dos adicionais", () => {
  assert.notEqual(lineKey(baseLine), lineKey({ ...baseLine, option_ids: ["queijo-extra"] }));
  assert.equal(
    lineKey({ ...baseLine, option_ids: ["a", "b"] }),
    lineKey({ ...baseLine, option_ids: ["b", "a"] }),
  );
});
test("estoque é conferido somando variantes do mesmo produto", () => {
  const limited = { ...products[0], stock_quantity: 2, reserved_quantity: 1 };
  assert.throws(
    () =>
      calculateQuote(
        config,
        [limited],
        [],
        [baseLine, { ...baseLine, option_ids: ["queijo-extra"] }],
        "pickup",
        "",
      ),
    /Estoque/,
  );
});
test("frete usa a faixa mais específica e a gratuidade depende do subtotal", () => {
  const broad = config.demo_delivery_zones[0];
  const narrow = {
    ...broad,
    id: "00000000-0000-4000-8000-000000000202",
    cep_start: "01000000",
    cep_end: "01009999",
    fee_cents: 300,
    free_from_cents: 5000,
  };
  assert.equal(
    calculateQuote(config, products, [broad, narrow], [baseLine], "delivery", "01001000")
      .shipping_cents,
    300,
  );
  assert.equal(
    calculateQuote(
      config,
      products,
      [broad, narrow],
      [{ ...baseLine, quantity: 2 }],
      "delivery",
      "01001000",
    ).shipping_cents,
    0,
  );
});
test("CEP de outra região e modalidade pausada são rejeitados", () => {
  assert.throws(
    () =>
      calculateQuote(
        config,
        products,
        config.demo_delivery_zones,
        [baseLine],
        "delivery",
        "11700000",
      ),
    /Ainda não/,
  );
  assert.throws(
    () =>
      calculateQuote(
        { ...config, sales: { ...config.sales, pickup_enabled: false } },
        products,
        [],
        [baseLine],
        "pickup",
        "",
      ),
    /modalidade/,
  );
});
test("medicamentos sujeitos a receita e controlados ficam bloqueados em todos os perfis", () => {
  for (const segment of ["restaurant", "snack_bar", "grocery", "pharmacy", "retail"] as const) {
    for (const sale_class of ["prescription", "controlled"] as const)
      assert.equal(canSell({ ...products[0], sale_class }, { ...config, segment }), false);
  }
  assert.equal(
    canSell({ ...products[0], sale_class: "otc", warning: "Leia a advertência." }, config),
    false,
  );
  assert.equal(
    canSell(
      { ...products[0], sale_class: "otc", warning: "Leia a advertência." },
      { ...config, segment: "pharmacy" },
    ),
    true,
  );
});
test("validação não aceita ids de opções repetidos nem advertência vazia em OTC", () => {
  assert.equal(
    productSchema.safeParse({
      ...products[0],
      options: [products[0].options[0], products[0].options[0]],
    }).success,
    false,
  );
  assert.equal(productSchema.safeParse({ ...products[0], sale_class: "otc" }).success, false);
});
test("requisição aceita só quantidades inteiras e descarta preços e status enviados pelo navegador", () => {
  const input = {
    items: [baseLine],
    fulfillment: "pickup",
    cep: "",
    idempotency_key: "00000000-0000-4000-8000-000000000301",
    name: "Cliente teste",
    phone: "11999999999",
    address: "",
    privacy_consent: true,
    expected_total_cents: 2890,
    total_cents: 1,
    status: "paid",
    store_slug: "outra-loja",
  };
  const parsed = orderInputSchema.parse(input);
  assert.equal("total_cents" in parsed, false);
  assert.equal("status" in parsed, false);
  assert.equal("store_slug" in parsed, false);
  assert.equal(
    orderInputSchema.safeParse({ ...input, items: [{ ...baseLine, quantity: 1.5 }] }).success,
    false,
  );
});
