import type { CartLine, DeliveryZone, Product, Quote, StoreConfig } from "./models";
export const money = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const available = (p: Product) =>
  p.stock_quantity === null ? null : p.stock_quantity - p.reserved_quantity;
export function canSell(product: Product, config: StoreConfig) {
  return (
    product.active &&
    (product.sale_class === "general" ||
      (config.segment === "pharmacy" && product.sale_class === "otc" && !!product.warning.trim()))
  );
}
export function lineKey(line: CartLine) {
  return `${line.product_id}:${[...line.option_ids].sort().join(",")}`;
}
export function unitPrice(p: Product, selected: string[]) {
  if (new Set(selected).size !== selected.length) throw new Error("Adicional repetido.");
  const all = p.options.flatMap((g) => g.choices);
  if (selected.some((id) => !all.some((c) => c.id === id)))
    throw new Error("Adicional indisponível.");
  for (const group of p.options) {
    const count = group.choices.filter((c) => selected.includes(c.id)).length;
    if (count < group.min || count > group.max)
      throw new Error(`Escolha de ${group.min} a ${group.max} opções em ${group.name}.`);
  }
  return (
    p.price_cents +
    all.filter((c) => selected.includes(c.id)).reduce((sum, c) => sum + c.price_cents, 0)
  );
}
export function calculateQuote(
  config: StoreConfig,
  products: Product[],
  zones: DeliveryZone[],
  items: CartLine[],
  fulfillment: "pickup" | "delivery",
  cep: string,
): Quote {
  if (
    (fulfillment === "pickup" && !config.sales.pickup_enabled) ||
    (fulfillment === "delivery" && !config.sales.delivery_enabled)
  )
    throw new Error("Esta modalidade está indisponível.");
  const totals = new Map<string, number>();
  const lines = items.map((item) => {
    const p = products.find((p) => p.id === item.product_id);
    if (!p || !canSell(p, config)) throw new Error("Um item está indisponível para venda.");
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 50)
      throw new Error("Quantidade inválida.");
    const quantity = (totals.get(p.id) || 0) + item.quantity;
    totals.set(p.id, quantity);
    const stock = available(p);
    if (stock !== null && quantity > stock) throw new Error(`Estoque insuficiente de ${p.name}.`);
    return {
      product_id: p.id,
      name: p.name,
      quantity: item.quantity,
      unit_cents: unitPrice(p, item.option_ids),
      options: p.options
        .flatMap((g) => g.choices)
        .filter((c) => item.option_ids.includes(c.id))
        .map((c) => c.name),
    };
  });
  const subtotal = lines.reduce((sum, line) => sum + line.unit_cents * line.quantity, 0);
  if (subtotal < config.sales.min_order_cents)
    throw new Error(`Pedido mínimo de ${money(config.sales.min_order_cents)}.`);
  let shipping = 0;
  if (fulfillment === "delivery") {
    if (!/^\d{8}$/.test(cep)) throw new Error("Informe um CEP com 8 dígitos.");
    const zone = zones
      .filter((z) => z.enabled && cep >= z.cep_start && cep <= z.cep_end)
      .sort(
        (a, b) =>
          Number(a.cep_end) - Number(a.cep_start) - (Number(b.cep_end) - Number(b.cep_start)) ||
          a.id.localeCompare(b.id),
      )[0];
    if (!zone) throw new Error("Ainda não entregamos neste CEP. Confira a opção de retirada.");
    shipping =
      zone.free_from_cents !== null && subtotal >= zone.free_from_cents ? 0 : zone.fee_cents;
  }
  if (!Number.isSafeInteger(subtotal + shipping) || subtotal + shipping > 100_000_000)
    throw new Error("Valor do pedido excede o limite.");
  return {
    subtotal_cents: subtotal,
    shipping_cents: shipping,
    total_cents: subtotal + shipping,
    lines,
  };
}
