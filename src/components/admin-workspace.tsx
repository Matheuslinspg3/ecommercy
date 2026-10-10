"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowUpRight, ClipboardList, Package, Plus, Settings, Store, X } from "lucide-react";
import { available, money } from "@/lib/domain";
import { segments, statusLabels } from "@/lib/segments";
import { orderStatuses, type Order, type Product, type StoreSnapshot } from "@/lib/models";

async function post(path: string, body: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Não foi possível salvar.");
  return data;
}
export function AdminWorkspace({
  initial,
  orders,
  role,
}: {
  initial: StoreSnapshot;
  orders: Order[];
  role: "owner" | "operator";
}) {
  const [tab, setTab] = useState<"orders" | "products" | "settings">("orders");
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const [config, setConfig] = useState(initial.config);
  const [zones, setZones] = useState(initial.zones);
  const [accepting, setAccepting] = useState(initial.accepting_orders);
  useEffect(() => {
    if (initial.demo || tab !== "orders") return;
    const timer = setInterval(() => router.refresh(), 15000);
    return () => clearInterval(timer);
  }, [initial.demo, tab, router]);
  async function action(task: () => Promise<unknown>) {
    setBusy(true);
    setMessage("");
    try {
      await task();
      setMessage("Alteração salva.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <Link href="/" className="wordmark">
          <span className="brand-symbol">
            <Store size={21} />
          </span>
          {initial.config.name}
        </Link>
        <span className="eyebrow">Área da equipe</span>
        <nav aria-label="Painel">
          <button
            aria-current={tab === "orders" ? "page" : undefined}
            onClick={() => setTab("orders")}
          >
            <ClipboardList size={19} />
            Pedidos
          </button>
          {role === "owner" && (
            <>
              <button
                aria-current={tab === "products" ? "page" : undefined}
                onClick={() => setTab("products")}
              >
                <Package size={19} />
                Catálogo
              </button>
              <button
                aria-current={tab === "settings" ? "page" : undefined}
                onClick={() => setTab("settings")}
              >
                <Settings size={19} />
                Minha loja
              </button>
            </>
          )}
        </nav>
        <Link className="sidebar-store" href="/">
          Abrir loja <ArrowUpRight size={18} />
        </Link>
        {!initial.demo && (
          <button
            onClick={async () => {
              await fetch("/api/auth", { method: "DELETE" });
              router.push("/entrar");
              router.refresh();
            }}
          >
            Sair da conta
          </button>
        )}
      </aside>
      <main id="conteudo" className="admin-main">
        <header className="admin-heading">
          <div>
            <span className="eyebrow">
              {segments[initial.config.segment].label} · {role === "owner" ? "Dono" : "Operador"}
            </span>
            <h1>
              {tab === "orders"
                ? "Os pedidos, em dia."
                : tab === "products"
                  ? "Seu catálogo."
                  : "A sua marca, do seu jeito."}
            </h1>
          </div>
          <span className="pill">
            {initial.demo
              ? "Demonstração"
              : initial.accepting_orders
                ? "Recebendo pedidos"
                : "Pedidos pausados"}
          </span>
        </header>
        {initial.demo && (
          <p className="notice">
            Painel demonstrativo, somente leitura. Os produtos são exemplos. Conecte uma instalação
            própria para cadastrar e receber pedidos reais.
          </p>
        )}
        {message && (
          <p className="notice" role="status">
            {message}
          </p>
        )}
        {tab === "orders" && (
          <>
            <div className="stat-grid">
              <div className="panel">
                <small>Pedidos em atendimento</small>
                <strong>
                  {orders.filter((o) => !["completed", "canceled"].includes(o.status)).length}
                </strong>
              </div>
              <div className="panel">
                <small>Produtos cadastrados</small>
                <strong>{initial.products.length}</strong>
              </div>
              <div className="panel">
                <small>Com estoque baixo</small>
                <strong>
                  {
                    initial.products.filter((p) => {
                      const stock = available(p);
                      return stock !== null && stock <= config.sales.low_stock_threshold;
                    }).length
                  }
                </strong>
              </div>
            </div>
            <div className="section-heading">
              <h2>Últimos pedidos</h2>
              <button
                className="button outline"
                disabled={busy || initial.demo}
                onClick={() => action(() => post("/api/admin/expire", {}))}
              >
                Liberar pedidos expirados
              </button>
            </div>
            <p className="muted">
              Pedidos aguardam sua confirmação. Recebimento do pagamento é conferido pela equipe.
            </p>
            {!orders.length && (
              <div className="empty-state panel">
                <ClipboardList size={38} />
                <h3>Nenhum pedido por aqui ainda.</h3>
                <p>Os pedidos recebidos aparecerão neste painel.</p>
              </div>
            )}
            {orders.map((order) => (
              <OrderCard
                key={`${order.id}-${order.status}-${order.payment_status}`}
                order={order}
                disabled={initial.demo || busy}
                onSave={(status, paid) =>
                  action(() =>
                    post("/api/admin/orders", { id: order.id, status, payment_received: paid }),
                  )
                }
              />
            ))}
          </>
        )}
        {tab === "products" && (
          <>
            <div className="section-heading">
              <p className="muted">Disponibilidade e preços da sua loja.</p>
              <button
                className="button primary"
                onClick={() => setEditing("new")}
                disabled={initial.demo}
              >
                <Plus size={17} />
                Novo produto
              </button>
            </div>
            {editing && (
              <ProductEditor
                key={editing === "new" ? "new" : editing.id}
                product={editing === "new" ? null : editing}
                pharmacy={config.segment === "pharmacy"}
                onClose={() => setEditing(null)}
                onSaved={() => {
                  setEditing(null);
                  router.refresh();
                }}
              />
            )}
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Preço</th>
                    <th>Disponível / reservado</th>
                    <th>Status</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {initial.products.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <strong>{p.name}</strong>
                        <small>{p.category}</small>
                      </td>
                      <td>{money(p.price_cents)}</td>
                      <td>
                        {available(p) === null
                          ? "Sob demanda"
                          : `${available(p)} / ${p.reserved_quantity}`}
                      </td>
                      <td>{p.active ? "Ativo" : "Pausado"}</td>
                      <td>
                        <button
                          className="text-button"
                          disabled={initial.demo}
                          onClick={() => setEditing(p)}
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {tab === "settings" && (
          <form
            className="settings-form"
            onSubmit={(e) => {
              e.preventDefault();
              action(() =>
                post("/api/admin/settings", { config, zones, accepting_orders: accepting }),
              );
            }}
          >
            <fieldset disabled={busy || initial.demo}>
              <section className="panel">
                <h2>Identidade e atendimento</h2>
                <div className="form-grid">
                  <label>
                    Nome da loja
                    <input
                      value={config.name}
                      onChange={(e) => setConfig({ ...config, name: e.target.value })}
                      required
                      maxLength={100}
                    />
                  </label>
                  <label>
                    Segmento
                    <select
                      value={config.segment}
                      onChange={(e) =>
                        setConfig({ ...config, segment: e.target.value as typeof config.segment })
                      }
                    >
                      {Object.entries(segments).map(([value, s]) => (
                        <option key={value} value={value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="span-two">
                    Chamada principal
                    <input
                      value={config.tagline}
                      onChange={(e) => setConfig({ ...config, tagline: e.target.value })}
                      maxLength={160}
                      required
                    />
                  </label>
                  <label className="span-two">
                    Apresentação
                    <textarea
                      value={config.description}
                      onChange={(e) => setConfig({ ...config, description: e.target.value })}
                      maxLength={500}
                      required
                    />
                  </label>
                  <label>
                    Cor principal
                    <input
                      type="color"
                      value={config.branding.primary}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          branding: { ...config.branding, primary: e.target.value },
                        })
                      }
                    />
                  </label>
                  <label>
                    Cor de apoio
                    <input
                      type="color"
                      value={config.branding.secondary}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          branding: { ...config.branding, secondary: e.target.value },
                        })
                      }
                    />
                  </label>
                  <label>
                    Cor de fundo
                    <input
                      type="color"
                      value={config.branding.background}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          branding: { ...config.branding, background: e.target.value },
                        })
                      }
                    />
                  </label>
                  <label>
                    Endereço da logo
                    <input
                      value={config.branding.logo}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          branding: { ...config.branding, logo: e.target.value },
                        })
                      }
                      placeholder="https://..."
                    />
                  </label>
                  <label>
                    WhatsApp com país e DDD
                    <input
                      value={config.contact.whatsapp}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          contact: {
                            ...config.contact,
                            whatsapp: e.target.value.replace(/\D/g, ""),
                          },
                        })
                      }
                      placeholder="5511999999999"
                    />
                  </label>
                  <label>
                    Telefone
                    <input
                      value={config.contact.phone}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          contact: { ...config.contact, phone: e.target.value },
                        })
                      }
                    />
                  </label>
                  <label>
                    Email de contato
                    <input
                      type="email"
                      value={config.contact.email}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          contact: { ...config.contact, email: e.target.value },
                        })
                      }
                    />
                  </label>
                  <label>
                    Horários
                    <input
                      value={config.location.hours}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          location: { ...config.location, hours: e.target.value },
                        })
                      }
                    />
                  </label>
                  <label>
                    Cidade
                    <input
                      value={config.location.city}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          location: { ...config.location, city: e.target.value },
                        })
                      }
                      required
                    />
                  </label>
                  <label>
                    Estado
                    <input
                      value={config.location.state}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          location: { ...config.location, state: e.target.value.toUpperCase() },
                        })
                      }
                      required
                      maxLength={2}
                    />
                  </label>
                  <label className="span-two">
                    Endereço da loja
                    <input
                      value={config.location.address}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          location: { ...config.location, address: e.target.value },
                        })
                      }
                    />
                  </label>
                </div>
              </section>
              <section className="panel">
                <h2>Recebimento de pedidos</h2>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={accepting}
                    onChange={(e) => setAccepting(e.target.checked)}
                  />
                  Aceitar pedidos na loja online
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={config.sales.pickup_enabled}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        sales: { ...config.sales, pickup_enabled: e.target.checked },
                      })
                    }
                  />
                  Permitir retirada
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={config.sales.delivery_enabled}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        sales: { ...config.sales, delivery_enabled: e.target.checked },
                      })
                    }
                  />
                  Permitir entrega
                </label>
                <div className="form-grid">
                  <label>
                    Pedido mínimo em R$
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={config.sales.min_order_cents / 100}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          sales: {
                            ...config.sales,
                            min_order_cents: Math.round(Number(e.target.value) * 100),
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    Avisar últimas unidades abaixo de
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={config.sales.low_stock_threshold}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          sales: { ...config.sales, low_stock_threshold: Number(e.target.value) },
                        })
                      }
                    />
                  </label>
                </div>
                <p className="muted">Nesta versão, o pagamento é feito na entrega ou retirada.</p>
              </section>
              <section className="panel">
                <div className="section-heading">
                  <h2>Regiões de entrega</h2>
                  <button
                    type="button"
                    className="button outline"
                    onClick={() =>
                      setZones([
                        ...zones,
                        {
                          id: crypto.randomUUID(),
                          name: "Nova região",
                          cep_start: "",
                          cep_end: "",
                          fee_cents: 0,
                          free_from_cents: null,
                          enabled: false,
                        },
                      ])
                    }
                  >
                    Adicionar região
                  </button>
                </div>
                {!zones.length && (
                  <p>
                    Nenhuma região cadastrada. Configure as faixas de CEP antes de oferecer entrega.
                  </p>
                )}
                {zones.map((zone, i) => {
                  const patch = (change: Partial<typeof zone>) =>
                    setZones(zones.map((z, n) => (n === i ? { ...z, ...change } : z)));
                  return (
                    <div className="zone-editor" key={zone.id}>
                      <div className="form-grid">
                        <label>
                          Região
                          <input
                            value={zone.name}
                            onChange={(e) => patch({ name: e.target.value })}
                            required
                          />
                        </label>
                        <label>
                          CEP inicial
                          <input
                            value={zone.cep_start}
                            onChange={(e) =>
                              patch({ cep_start: e.target.value.replace(/\D/g, "").slice(0, 8) })
                            }
                            required
                            pattern="[0-9]{8}"
                            inputMode="numeric"
                          />
                        </label>
                        <label>
                          CEP final
                          <input
                            value={zone.cep_end}
                            onChange={(e) =>
                              patch({ cep_end: e.target.value.replace(/\D/g, "").slice(0, 8) })
                            }
                            required
                            pattern="[0-9]{8}"
                            inputMode="numeric"
                          />
                        </label>
                        <label>
                          Frete em R$
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={zone.fee_cents / 100}
                            onChange={(e) =>
                              patch({ fee_cents: Math.round(Number(e.target.value) * 100) })
                            }
                          />
                        </label>
                        <label>
                          Grátis a partir de R$
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={zone.free_from_cents === null ? "" : zone.free_from_cents / 100}
                            onChange={(e) =>
                              patch({
                                free_from_cents:
                                  e.target.value === ""
                                    ? null
                                    : Math.round(Number(e.target.value) * 100),
                              })
                            }
                            placeholder="Sem gratuidade"
                          />
                        </label>
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={zone.enabled}
                            onChange={(e) => patch({ enabled: e.target.checked })}
                          />
                          Região ativa
                        </label>
                      </div>
                      <button
                        type="button"
                        className="text-button danger"
                        onClick={() => setZones(zones.filter((_, n) => n !== i))}
                      >
                        Remover região
                      </button>
                    </div>
                  );
                })}
              </section>
              <button className="button primary" type="submit">
                Salvar configurações
              </button>
            </fieldset>
          </form>
        )}
      </main>
    </div>
  );
}
function OrderCard({
  order,
  disabled,
  onSave,
}: {
  order: Order;
  disabled: boolean;
  onSave: (status: Order["status"], paid: boolean) => void;
}) {
  const [status, setStatus] = useState(order.status);
  const [paid, setPaid] = useState(false);
  return (
    <article className="panel order-card">
      <div className="section-heading">
        <h3>
          #{order.number} · {order.customer.name}
        </h3>
        <strong>{money(order.total_cents)}</strong>
      </div>
      <p>
        {statusLabels[order.status]} · {order.fulfillment === "pickup" ? "Retirada" : "Entrega"} ·{" "}
        {order.customer.phone}
      </p>
      {order.address && <p>{order.address}</p>}
      <ul>
        {order.lines.map((line, i) => (
          <li key={i}>
            {line.quantity} × {line.name}
            {line.options.length ? ` · ${line.options.join(", ")}` : ""}
          </li>
        ))}
      </ul>
      {!["completed", "canceled"].includes(order.status) && (
        <fieldset disabled={disabled}>
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value as Order["status"])}>
              {orderStatuses.map((s) => (
                <option value={s} key={s}>
                  {statusLabels[s]}
                </option>
              ))}
            </select>
          </label>
          {order.payment_status !== "received" && (
            <label className="checkbox-label">
              <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
              Conferi e recebi o pagamento
            </label>
          )}
          <button className="button outline" onClick={() => onSave(status, paid)}>
            Atualizar pedido
          </button>
        </fieldset>
      )}
      {order.payment_status === "received" && (
        <p className="muted">Pagamento conferido pela equipe.</p>
      )}
    </article>
  );
}
function ProductEditor({
  product,
  pharmacy,
  onClose,
  onSaved,
}: {
  product: Product | null;
  pharmacy: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [demand, setDemand] = useState(product ? product.stock_quantity === null : false);
  const [groups, setGroups] = useState(product?.options || []);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="panel product-editor"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setMessage("");
        const name = String(f.get("name")).trim();
        const id = product?.id || crypto.randomUUID();
        const value = {
          id,
          name,
          slug:
            product?.slug ||
            `${
              name
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, "")
                .slice(0, 70) || "produto"
            }-${id.slice(0, 8)}`,
          description: String(f.get("description")),
          category: String(f.get("category")),
          image_url: String(f.get("image_url")),
          price_cents: Math.round(Number(f.get("price")) * 100),
          stock_quantity: demand ? null : Number(f.get("stock")),
          sale_class: String(f.get("sale_class") || product?.sale_class || "general"),
          warning: String(f.get("warning") || product?.warning || ""),
          art: String(f.get("art")),
          active: f.get("active") === "on",
          options: groups,
        };
        try {
          await post("/api/admin/products", value);
          onSaved();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Não foi possível salvar.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="section-heading">
        <h2>{product ? "Editar produto" : "Novo produto"}</h2>
        <button type="button" className="icon-button" aria-label="Fechar editor" onClick={onClose}>
          <X size={19} />
        </button>
      </div>
      <fieldset disabled={busy}>
        <div className="form-grid">
          <label>
            Nome
            <input name="name" defaultValue={product?.name} required maxLength={140} />
          </label>
          <label>
            Categoria
            <input name="category" defaultValue={product?.category} required maxLength={100} />
          </label>
          <label>
            Preço em R$
            <input
              type="number"
              name="price"
              defaultValue={product ? product.price_cents / 100 : ""}
              required
              min="0.01"
              max="1000000"
              step="0.01"
            />
          </label>
          <label>
            Estoque físico
            <input
              type="number"
              name="stock"
              defaultValue={product?.stock_quantity ?? 0}
              min={product?.reserved_quantity || 0}
              max="1000000"
              disabled={demand}
              required={!demand}
            />
          </label>
          <label className="checkbox-label">
            <input type="checkbox" checked={demand} onChange={(e) => setDemand(e.target.checked)} />
            Produzido sob demanda
          </label>
          <label className="checkbox-label">
            <input type="checkbox" name="active" defaultChecked={product?.active ?? true} />
            Produto ativo
          </label>
          <label className="span-two">
            Descrição
            <textarea name="description" defaultValue={product?.description} maxLength={1000} />
          </label>
          <label>
            Endereço HTTPS da imagem
            <input
              name="image_url"
              type="url"
              defaultValue={product?.image_url || ""}
              placeholder="https://..."
            />
          </label>
          <label>
            Ilustração quando não há foto
            <select name="art" defaultValue={product?.art || "package"}>
              {Object.entries({
                meal: "Prato",
                burger: "Lanche",
                drink: "Bebida",
                produce: "Hortifruti",
                package: "Produto",
                care: "Cuidados",
              }).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {pharmacy && (
            <>
              <label>
                Classe de venda
                <select name="sale_class" defaultValue={product?.sale_class || "general"}>
                  <option value="general">Produto geral</option>
                  <option value="otc">Isento de prescrição</option>
                  <option value="prescription">Exige receita · venda bloqueada</option>
                  <option value="controlled">Controlado · venda bloqueada</option>
                </select>
              </label>
              <label>
                Advertência
                <input name="warning" defaultValue={product?.warning} maxLength={1000} />
              </label>
            </>
          )}
        </div>
        <div className="section-heading">
          <h3>Opções e adicionais</h3>
          <button
            type="button"
            className="button outline"
            disabled={groups.length >= 10}
            onClick={() =>
              setGroups([
                ...groups,
                {
                  id: `g-${crypto.randomUUID()}`,
                  name: "",
                  min: 0,
                  max: 1,
                  choices: [{ id: `c-${crypto.randomUUID()}`, name: "", price_cents: 0 }],
                },
              ])
            }
          >
            Adicionar grupo
          </button>
        </div>
        {groups.map((g, gi) => {
          const patch = (changes: Partial<typeof g>) =>
            setGroups(groups.map((item, i) => (i === gi ? { ...item, ...changes } : item)));
          return (
            <div className="zone-editor" key={g.id}>
              <div className="form-grid">
                <label>
                  Nome do grupo
                  <input
                    value={g.name}
                    onChange={(e) => patch({ name: e.target.value })}
                    required
                    placeholder="Ex.: Tamanho ou adicionais"
                  />
                </label>
                <label>
                  Escolha mínima
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={g.min}
                    onChange={(e) => patch({ min: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Escolha máxima
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={g.max}
                    onChange={(e) => patch({ max: Number(e.target.value) })}
                  />
                </label>
              </div>
              {g.choices.map((c, ci) => (
                <div className="choice-editor" key={c.id}>
                  <label>
                    Opção
                    <input
                      value={c.name}
                      onChange={(e) =>
                        patch({
                          choices: g.choices.map((choice, i) =>
                            i === ci ? { ...choice, name: e.target.value } : choice,
                          ),
                        })
                      }
                      required
                    />
                  </label>
                  <label>
                    Acréscimo em R$
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={c.price_cents / 100}
                      onChange={(e) =>
                        patch({
                          choices: g.choices.map((choice, i) =>
                            i === ci
                              ? { ...choice, price_cents: Math.round(Number(e.target.value) * 100) }
                              : choice,
                          ),
                        })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Remover opção"
                    onClick={() => patch({ choices: g.choices.filter((_, i) => i !== ci) })}
                  >
                    <X size={18} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="text-button"
                disabled={g.choices.length >= 20}
                onClick={() =>
                  patch({
                    choices: [
                      ...g.choices,
                      { id: `c-${crypto.randomUUID()}`, name: "", price_cents: 0 },
                    ],
                  })
                }
              >
                Adicionar opção
              </button>
              <button
                type="button"
                className="text-button danger"
                onClick={() => setGroups(groups.filter((_, i) => i !== gi))}
              >
                Remover grupo
              </button>
            </div>
          );
        })}
        {message && (
          <p className="notice" role="alert">
            {message}
          </p>
        )}
        <button className="button primary" type="submit">
          {busy ? "Salvando…" : "Salvar produto"}
        </button>
      </fieldset>
    </form>
  );
}
