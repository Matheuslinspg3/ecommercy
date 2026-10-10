"use client";
import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronRight,
  MapPin,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Store,
  Truck,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { available, canSell, lineKey, money, unitPrice } from "@/lib/domain";
import { segments } from "@/lib/segments";
import type { Product, Quote, StoreSnapshot } from "@/lib/models";
import { ProductArt } from "./product-art";
import { useCart } from "./use-cart";

export function Storefront({ initial }: { initial: StoreSnapshot }) {
  const { config, demo } = initial;
  const sector = segments[config.segment];
  const [cart, setCart] = useCart(config.slug);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todos");
  const [selected, setSelected] = useState<Product | null>(null);
  const [options, setOptions] = useState<string[]>([]);
  const [fulfillment, setFulfillment] = useState<"pickup" | "delivery">(
    config.sales.pickup_enabled ? "pickup" : "delivery",
  );
  const [cep, setCep] = useState("");
  const [message, setMessage] = useState("");
  const [quote, setQuote] = useState<{ value: Quote; key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [receipt, setReceipt] = useState<{
    demo: boolean;
    number?: number;
    code?: string;
    total: number;
  } | null>(null);
  const pending = useRef<string | null>(null);
  const cartDialog = useRef<HTMLDialogElement>(null);
  const productDialog = useRef<HTMLDialogElement>(null);
  const products = initial.products.filter((p) => canSell(p, config));
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const filtered = products.filter(
    (p) =>
      (category === "Todos" || p.category === category) &&
      normalize(`${p.name} ${p.category}`).includes(normalize(search)),
  );
  const categories = ["Todos", ...new Set(products.map((p) => p.category))];
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const quoteKey = JSON.stringify({ items: cart, fulfillment, cep });
  const currentQuote = quote?.key === quoteKey ? quote.value : null;
  function openCart() {
    setMessage("");
    setDialogOpen(true);
    cartDialog.current?.showModal();
  }
  function choose(product: Product) {
    setSelected(product);
    setOptions([]);
    setMessage("");
    setDialogOpen(true);
    productDialog.current?.showModal();
  }
  function addSelected() {
    if (!selected) return;
    try {
      unitPrice(selected, options);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Confira os adicionais.");
      return;
    }
    const candidate = { product_id: selected.id, quantity: 1, option_ids: [...options].sort() };
    const total = cart
      .filter((i) => i.product_id === selected.id)
      .reduce((sum, i) => sum + i.quantity, 0);
    const stock = available(selected);
    if (stock !== null && total >= stock) {
      setMessage("Você já adicionou as unidades disponíveis.");
      return;
    }
    const existing = cart.find((i) => lineKey(i) === lineKey(candidate));
    if (existing && existing.quantity >= 50) {
      setMessage("Limite de 50 unidades por item.");
      return;
    }
    if (!existing && cart.length >= 40) {
      setMessage("Limite de 40 itens diferentes por pedido.");
      return;
    }
    setCart(
      existing
        ? cart.map((i) =>
            lineKey(i) === lineKey(candidate) ? { ...i, quantity: i.quantity + 1 } : i,
          )
        : [...cart, candidate],
    );
    productDialog.current?.close();
    setMessage(`${selected.name} adicionado à cesta.`);
  }
  function changeQuantity(key: string, delta: number) {
    const next = cart
      .map((i) => (lineKey(i) === key ? { ...i, quantity: i.quantity + delta } : i))
      .filter((i) => i.quantity > 0);
    if (next.some((i) => i.quantity > 50)) return;
    for (const p of products) {
      const stock = available(p);
      if (
        stock !== null &&
        next.filter((i) => i.product_id === p.id).reduce((sum, i) => sum + i.quantity, 0) > stock
      ) {
        setMessage("Limite de estoque disponível.");
        return;
      }
    }
    setCart(next);
    setMessage("");
  }
  async function checkTotal() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: quoteKey,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível conferir o total.");
      setQuote({ value: data, key: quoteKey });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Tente novamente.");
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentQuote && !pending.current) return;
    if (!pending.current) {
      const form = new FormData(event.currentTarget);
      pending.current = JSON.stringify({
        items: cart,
        fulfillment,
        cep,
        idempotency_key: crypto.randomUUID(),
        expected_total_cents: currentQuote!.total_cents,
        name: form.get("name"),
        phone: String(form.get("phone")).replace(/\D/g, ""),
        address: form.get("address") || "",
        privacy_consent: form.get("consent") === "on",
      });
    }
    setBusy(true);
    setLocked(true);
    setMessage("");
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: pending.current,
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status < 500) {
          pending.current = null;
          setLocked(false);
          setQuote(null);
        }
        throw new Error(
          data.error || "Não foi possível confirmar o envio. Tente novamente com os mesmos dados.",
        );
      }
      setReceipt({
        demo: data.demo,
        number: data.order?.number,
        code: data.tracking_code,
        total: data.quote?.total_cents ?? data.order.total_cents,
      });
      pending.current = null;
      setLocked(false);
      setCart([]);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Envio ainda não confirmado. Tente novamente com os mesmos dados.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {demo && (
        <div className="demo-banner">
          Demonstração · catálogo de exemplo · nenhum pedido ou cobrança real
        </div>
      )}
      <header className="site-header">
        <Link href="/" className="wordmark">
          {config.branding.logo ? (
            <Image src={config.branding.logo} width={42} height={42} alt="" unoptimized />
          ) : (
            <span className="brand-symbol">
              <UtensilsCrossed size={21} />
            </span>
          )}
          <span>
            {config.name}
            <small>{sector.label} · loja própria</small>
          </span>
        </Link>
        <nav aria-label="Navegação principal">
          <a href="#catalogo">{sector.catalog}</a>
          <a href="#atendimento">Atendimento</a>
          <Link href="/acompanhar">Meu pedido</Link>
        </nav>
        <button
          className="cart-button"
          onClick={openCart}
          aria-label={`Abrir cesta, ${itemCount} itens`}
        >
          <ShoppingBag size={19} />
          <span>Cesta</span>
          <b key={itemCount}>{itemCount}</b>
        </button>
      </header>
      <main id="conteudo">
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="status-dot" />{" "}
              {initial.accepting_orders ? "Peça direto com a gente" : "Pedidos pausados"}
            </div>
            <h1>{sector.hero}</h1>
            <p>{config.description}</p>
            <a className="button primary" href="#catalogo">
              Explorar {sector.catalog.toLowerCase()} <ArrowRight size={18} />
            </a>
            <div className="hero-notes">
              {config.sales.pickup_enabled && (
                <span>
                  <Store size={16} /> Retirada na loja
                </span>
              )}
              {config.sales.delivery_enabled && (
                <span>
                  <Truck size={16} /> Entrega na região
                </span>
              )}
            </div>
          </div>
          <div className="hero-art">
            <span className="hero-caption">{config.tagline}</span>
            <ProductArt
              art={
                config.segment === "pharmacy"
                  ? "care"
                  : config.segment === "grocery"
                    ? "produce"
                    : config.segment === "retail"
                      ? "package"
                      : "meal"
              }
              large
            />
            <div className="hero-stamp">
              <span>Da nossa loja</span>
              <strong>para você.</strong>
              <ArrowRight size={24} />
            </div>
          </div>
        </section>
        <section className="catalog-section" id="catalogo">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Escolha o seu favorito</span>
              <h2>{sector.catalog} da casa</h2>
            </div>
            <label className="search-field">
              <Search size={18} />
              <input
                aria-label="Buscar produtos"
                placeholder="O que você procura?"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          </div>
          <div className="categories" aria-label="Categorias">
            {categories.map((name) => (
              <button key={name} aria-pressed={name === category} onClick={() => setCategory(name)}>
                {name}
              </button>
            ))}
          </div>
          <div className="product-grid">
            {filtered.map((p) => {
              const stock = available(p);
              return (
                <article className="product-card" key={p.id}>
                  <button
                    className="product-art-button"
                    onClick={() => choose(p)}
                    aria-label={`Ver ${p.name}`}
                    disabled={stock === 0}
                  >
                    <ProductVisual product={p} />
                  </button>
                  <div className="product-copy">
                    <small>{p.category}</small>
                    <h3>{p.name}</h3>
                    <p>{p.description}</p>
                    {p.warning && <p className="product-warning">{p.warning}</p>}
                    <div className="product-bottom">
                      <strong>{money(p.price_cents)}</strong>
                      <button
                        className="add-button"
                        onClick={() => choose(p)}
                        disabled={stock === 0 || !initial.accepting_orders}
                        aria-label={`Adicionar ${p.name}`}
                      >
                        <Plus size={19} />
                      </button>
                    </div>
                    <span className="stock-label">
                      {stock === 0
                        ? "Indisponível no momento"
                        : stock !== null && stock <= config.sales.low_stock_threshold
                          ? `Últimas ${stock} unidades`
                          : p.options.length
                            ? "Personalize o seu pedido"
                            : ""}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
          {!filtered.length && (
            <p className="empty-state">Nenhum produto encontrado. Experimente outra busca.</p>
          )}
          {(category !== "Todos" || search) && (
            <button
              className="button outline see-all"
              onClick={() => {
                setSearch("");
                setCategory("Todos");
              }}
            >
              Ver todos os produtos <ArrowRight size={17} />
            </button>
          )}
        </section>
        <section className="support-section" id="atendimento">
          <div>
            <span className="eyebrow">Perto de você</span>
            <h2>Conte com a nossa equipe.</h2>
            <p>{config.location.hours}</p>
            {config.contact.whatsapp ? (
              <a
                className="button primary"
                href={`https://wa.me/${config.contact.whatsapp}`}
                target="_blank"
                rel="noreferrer"
              >
                Falar com a loja <ArrowRight size={17} />
              </a>
            ) : (
              <p className="muted">Canal de atendimento a configurar.</p>
            )}
          </div>
          <div className="support-card">
            <Truck size={24} />
            <h3>Entrega e retirada</h3>
            <p>Confira as opções e o frete na sua cesta.</p>
            <button onClick={openCart} className="text-button">
              Consultar na cesta <ChevronRight size={17} />
            </button>
          </div>
          <div className="support-card">
            <MapPin size={24} />
            <h3>
              {config.location.city} · {config.location.state}
            </h3>
            <p>{config.location.address}</p>
            <span className="muted">{config.contact.phone || "Telefone a configurar"}</span>
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <strong>{config.name}</strong>
        <span>Compre direto. Seja bem-vindo.</span>
        <div>
          <Link href="/privacidade">Privacidade</Link>
          <Link href="/admin">Área da equipe</Link>
        </div>
      </footer>
      {message && !dialogOpen && (
        <div className="toast" role="status">
          <Check size={17} />
          {message}
        </div>
      )}
      <dialog
        className="product-dialog"
        ref={productDialog}
        aria-labelledby="product-dialog-title"
        onClose={() => setDialogOpen(false)}
      >
        <button
          className="close-button"
          aria-label="Fechar produto"
          onClick={() => productDialog.current?.close()}
        >
          <X size={21} />
        </button>
        {selected && (
          <>
            <ProductVisual product={selected} />
            <div className="dialog-content">
              <small className="eyebrow">{selected.category}</small>
              <h2 id="product-dialog-title">{selected.name}</h2>
              <p>{selected.description}</p>
              {selected.warning && <p>{selected.warning}</p>}
              {selected.options.map((group) => (
                <fieldset className="option-group" key={group.id}>
                  <legend>
                    {group.name}{" "}
                    <small>
                      {group.min
                        ? `Escolha de ${group.min} a ${group.max}`
                        : `Até ${group.max} opções`}
                    </small>
                  </legend>
                  {group.choices.map((choice) => (
                    <label key={choice.id}>
                      <input
                        type="checkbox"
                        checked={options.includes(choice.id)}
                        onChange={(e) =>
                          setOptions(
                            e.target.checked
                              ? [...options, choice.id]
                              : options.filter((o) => o !== choice.id),
                          )
                        }
                      />
                      {choice.name}
                      <span>+ {money(choice.price_cents)}</span>
                    </label>
                  ))}
                </fieldset>
              ))}
              {message && (
                <p role="status" className="notice">
                  {message}
                </p>
              )}
              <button
                className="button primary full"
                onClick={addSelected}
                disabled={locked || !initial.accepting_orders}
              >
                Adicionar à cesta{" "}
                <span>
                  {money(
                    selected.price_cents +
                      selected.options
                        .flatMap((g) => g.choices)
                        .filter((c) => options.includes(c.id))
                        .reduce((sum, c) => sum + c.price_cents, 0),
                  )}
                </span>
              </button>
            </div>
          </>
        )}
      </dialog>
      <dialog
        className="cart-dialog"
        ref={cartDialog}
        aria-labelledby="cart-title"
        onClose={() => setDialogOpen(false)}
      >
        <div className="cart-heading">
          <div>
            <span className="eyebrow">Seu pedido</span>
            <h2 id="cart-title">Sua cesta</h2>
          </div>
          <button
            className="close-button"
            aria-label="Fechar cesta"
            onClick={() => cartDialog.current?.close()}
          >
            <X size={21} />
          </button>
        </div>
        {receipt ? (
          <div className="receipt">
            <div className="success-icon">
              <Check size={30} />
            </div>
            <h3>{receipt.demo ? "Simulação concluída" : `Pedido #${receipt.number} enviado`}</h3>
            <p>
              {receipt.demo
                ? "Nenhum pedido real foi enviado e nenhuma cobrança foi criada."
                : "Aguarde a confirmação da loja. Pagamento no recebimento."}
            </p>
            <strong>{money(receipt.total)}</strong>
            {receipt.code && (
              <>
                <label>
                  Código de acompanhamento
                  <textarea readOnly value={receipt.code} aria-label="Código de acompanhamento" />
                </label>
                <p>Guarde este código para consultar seu pedido.</p>
                <Link href="/acompanhar">Acompanhar pedido</Link>
              </>
            )}
            <button
              className="button primary"
              onClick={() => {
                setReceipt(null);
                cartDialog.current?.close();
              }}
            >
              Continuar escolhendo
            </button>
          </div>
        ) : !cart.length ? (
          <div className="empty-state">
            <ShoppingBag size={48} strokeWidth={1.2} />
            <h3>A cesta está esperando você.</h3>
            <p>Escolha seus favoritos para começar.</p>
            <button className="button primary" onClick={() => cartDialog.current?.close()}>
              Explorar {sector.catalog.toLowerCase()}
            </button>
          </div>
        ) : (
          <>
            <div className="cart-lines">
              {cart.map((line) => {
                const p = products.find((p) => p.id === line.product_id);
                let price = 0;
                try {
                  if (p) price = unitPrice(p, line.option_ids);
                } catch {
                  /* Cesta será validada antes de enviar. */
                }
                return (
                  <div className="cart-line" key={lineKey(line)}>
                    <div>
                      <h3>{p?.name || "Produto indisponível"}</h3>
                      <small>
                        {p?.options
                          .flatMap((g) => g.choices)
                          .filter((c) => line.option_ids.includes(c.id))
                          .map((c) => c.name)
                          .join(", ")}
                      </small>
                      <strong>{money(price * line.quantity)}</strong>
                    </div>
                    <div className="quantity">
                      <button
                        aria-label={`Diminuir ${p?.name || "produto"}`}
                        onClick={() => changeQuantity(lineKey(line), -1)}
                        disabled={busy || locked}
                      >
                        <Minus size={15} />
                      </button>
                      <span>{line.quantity}</span>
                      <button
                        aria-label={`Aumentar ${p?.name || "produto"}`}
                        onClick={() => changeQuantity(lineKey(line), 1)}
                        disabled={busy || locked}
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <fieldset className="fulfillment" disabled={busy || locked}>
              <legend>Como você quer receber?</legend>
              {config.sales.pickup_enabled && (
                <label>
                  <input
                    type="radio"
                    name="fulfillment"
                    value="pickup"
                    checked={fulfillment === "pickup"}
                    onChange={() => setFulfillment("pickup")}
                  />
                  <Store size={19} />
                  Retirar na loja
                </label>
              )}
              {config.sales.delivery_enabled && (
                <label>
                  <input
                    type="radio"
                    name="fulfillment"
                    value="delivery"
                    checked={fulfillment === "delivery"}
                    onChange={() => setFulfillment("delivery")}
                  />
                  <Truck size={19} />
                  Receber em casa
                </label>
              )}
              {fulfillment === "delivery" && (
                <label className="cep-field">
                  CEP
                  <input
                    aria-label="CEP de entrega"
                    value={cep}
                    onChange={(e) => setCep(e.target.value.replace(/\D/g, "").slice(0, 8))}
                    inputMode="numeric"
                    maxLength={8}
                    placeholder="00000000"
                  />
                </label>
              )}
            </fieldset>
            {!currentQuote && !locked && (
              <button className="button outline full" onClick={checkTotal} disabled={busy}>
                Conferir total e frete <ArrowRight size={17} />
              </button>
            )}
            {currentQuote && (
              <div className="order-totals">
                <div>
                  <span>Produtos</span>
                  <span>{money(currentQuote.subtotal_cents)}</span>
                </div>
                <div>
                  <span>{fulfillment === "pickup" ? "Retirada" : "Entrega"}</span>
                  <span>
                    {currentQuote.shipping_cents === 0
                      ? "Grátis"
                      : money(currentQuote.shipping_cents)}
                  </span>
                </div>
                <div>
                  <strong>Total</strong>
                  <strong>{money(currentQuote.total_cents)}</strong>
                </div>
              </div>
            )}
            {(currentQuote || locked) && (
              <form onSubmit={submit} className="checkout-form">
                <fieldset disabled={busy || locked}>
                  <legend>Seus dados</legend>
                  <label>
                    Nome
                    <input name="name" autoComplete="name" required minLength={2} maxLength={100} />
                  </label>
                  <label>
                    Celular com DDD
                    <input
                      name="phone"
                      type="tel"
                      autoComplete="tel-national"
                      required
                      pattern="[0-9 ()-]{10,20}"
                      maxLength={20}
                    />
                  </label>
                  {fulfillment === "delivery" && (
                    <label>
                      Endereço completo
                      <input
                        name="address"
                        autoComplete="street-address"
                        required
                        minLength={8}
                        maxLength={300}
                        placeholder="Rua, número, bairro e complemento"
                      />
                    </label>
                  )}
                  <label className="consent">
                    <input type="checkbox" name="consent" required />
                    Li a <Link href="/privacidade">política de privacidade</Link> e autorizo o uso
                    dos dados para este pedido.
                  </label>
                </fieldset>
                <p className="payment-note">
                  Pagamento no recebimento. A loja confirma a disponibilidade e o atendimento.
                </p>
                <button
                  className="button primary full"
                  type="submit"
                  disabled={busy || !initial.accepting_orders}
                >
                  {busy
                    ? "Enviando…"
                    : locked
                      ? "Tentar o mesmo envio novamente"
                      : demo
                        ? "Simular pedido"
                        : "Enviar pedido"}
                  <ArrowRight size={17} />
                </button>
                {locked && !busy && (
                  <p className="notice">
                    O envio ainda não foi confirmado. Tente novamente sem fechar esta janela para
                    consultar a mesma solicitação.
                  </p>
                )}
              </form>
            )}
            {message && (
              <p role="alert" className="notice">
                {message}
              </p>
            )}
          </>
        )}
      </dialog>
    </>
  );
}
function ProductVisual({ product }: { product: Product }) {
  return product.image_url ? (
    <div className="product-photo">
      <Image src={product.image_url} alt={product.name} width={600} height={360} unoptimized />
    </div>
  ) : (
    <ProductArt art={product.art} />
  );
}
