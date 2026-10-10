import { z } from "zod";

const cents = z.number().int().min(0).max(100_000_000);
const text = (max: number) => z.string().trim().max(max);
export const segmentSchema = z.enum(["restaurant", "snack_bar", "grocery", "pharmacy", "retail"]);
export type Segment = z.infer<typeof segmentSchema>;
export const zoneSchema = z
  .object({
    id: z.uuid(),
    name: text(100).min(1),
    cep_start: z.string().regex(/^\d{8}$/),
    cep_end: z.string().regex(/^\d{8}$/),
    fee_cents: cents,
    free_from_cents: cents.nullable(),
    enabled: z.boolean(),
  })
  .refine((z) => z.cep_start <= z.cep_end, "Faixa de CEP inválida.");
export type DeliveryZone = z.infer<typeof zoneSchema>;
export const storeConfigSchema = z.object({
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(63),
  name: text(100).min(2),
  segment: segmentSchema,
  tagline: text(160).min(1),
  description: text(500).min(1),
  branding: z.object({
    primary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    secondary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    logo: z.union([
      z.literal(""),
      z
        .string()
        .regex(/^\/(?!\/)[a-zA-Z0-9/_\-.]+$/)
        .refine((p) => !p.includes("..")),
      z.url().refine((p) => p.startsWith("https://")),
    ]),
  }),
  contact: z.object({
    whatsapp: z.string().regex(/^$|^55\d{10,11}$/),
    phone: text(30),
    email: z.union([z.literal(""), z.email()]),
  }),
  location: z.object({
    city: text(100).min(1),
    state: z.string().regex(/^[A-Z]{2}$/),
    address: text(300),
    hours: text(200),
  }),
  sales: z.object({
    pickup_enabled: z.boolean(),
    delivery_enabled: z.boolean(),
    min_order_cents: cents,
    low_stock_threshold: z.number().int().min(0).max(100),
  }),
  demo_delivery_zones: z.array(zoneSchema).max(30),
});
export type StoreConfig = z.infer<typeof storeConfigSchema>;
export const optionGroupSchema = z
  .object({
    id: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .max(40),
    name: text(100).min(1),
    min: z.number().int().min(0).max(10),
    max: z.number().int().min(1).max(10),
    choices: z
      .array(
        z.object({
          id: z
            .string()
            .regex(/^[a-z0-9-]+$/)
            .max(40),
          name: text(100).min(1),
          price_cents: cents,
        }),
      )
      .min(1)
      .max(20),
  })
  .refine((g) => g.min <= g.max && g.max <= g.choices.length, "Limites dos adicionais inválidos.");
export const productSchema = z
  .object({
    id: z.uuid(),
    slug: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .max(100),
    name: text(140).min(1),
    category: text(100).min(1),
    description: text(1000),
    image_url: z
      .union([z.literal(""), z.url().refine((url) => url.startsWith("https://"))])
      .default(""),
    price_cents: cents.refine((v) => v > 0),
    stock_quantity: z.number().int().min(0).max(1_000_000).nullable(),
    reserved_quantity: z.number().int().min(0).max(1_000_000),
    sale_class: z.enum(["general", "otc", "prescription", "controlled"]),
    warning: text(1000),
    active: z.boolean(),
    options: z.array(optionGroupSchema).max(10),
    art: z.enum(["meal", "burger", "drink", "produce", "package", "care"]),
  })
  .superRefine((p, ctx) => {
    if (p.sale_class === "otc" && !p.warning)
      ctx.addIssue({ code: "custom", message: "Produto isento de prescrição exige advertência." });
    if (p.stock_quantity !== null && p.reserved_quantity > p.stock_quantity)
      ctx.addIssue({ code: "custom", message: "Estoque abaixo das reservas." });
    const groups = p.options.map((g) => g.id);
    const choices = p.options.flatMap((g) => g.choices.map((c) => c.id));
    if (new Set(groups).size !== groups.length || new Set(choices).size !== choices.length)
      ctx.addIssue({ code: "custom", message: "Identificadores de adicionais repetidos." });
  });
export type Product = z.infer<typeof productSchema>;
export const cartLineSchema = z.object({
  product_id: z.uuid(),
  quantity: z.number().int().min(1).max(50),
  option_ids: z.array(z.string().max(40)).max(100),
});
export type CartLine = z.infer<typeof cartLineSchema>;
export const quoteInputSchema = z.object({
  items: z.array(cartLineSchema).min(1).max(40),
  fulfillment: z.enum(["pickup", "delivery"]),
  cep: z.string().regex(/^$|^\d{8}$/),
});
export const orderInputSchema = quoteInputSchema
  .extend({
    idempotency_key: z.uuid(),
    name: text(100).min(2),
    expected_total_cents: cents,
    phone: z.string().regex(/^[1-9]\d\d{8,9}$/),
    address: text(300),
    privacy_consent: z.literal(true),
  })
  .refine(
    (i) => i.fulfillment !== "delivery" || i.address.length >= 8,
    "Preencha o endereço para entrega.",
  );
export type OrderInput = z.infer<typeof orderInputSchema>;
export type Quote = {
  subtotal_cents: number;
  shipping_cents: number;
  total_cents: number;
  lines: {
    product_id: string;
    name: string;
    quantity: number;
    unit_cents: number;
    options: string[];
  }[];
};
export const orderStatuses = [
  "pending",
  "accepted",
  "preparing",
  "ready_for_pickup",
  "out_for_delivery",
  "completed",
  "canceled",
] as const;
export type OrderStatus = (typeof orderStatuses)[number];
export type Order = {
  id: string;
  number: number;
  status: OrderStatus;
  payment_status: string;
  fulfillment: "pickup" | "delivery";
  total_cents: number;
  customer: { name: string; phone: string };
  address: string;
  created_at: string;
  expires_at: string;
  lines: Quote["lines"];
};
export type StoreSnapshot = {
  config: StoreConfig;
  products: Product[];
  zones: DeliveryZone[];
  demo: boolean;
  accepting_orders: boolean;
};
