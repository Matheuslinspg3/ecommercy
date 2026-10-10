"use client";
import { useState } from "react";
import { money } from "@/lib/domain";
import { statusLabels } from "@/lib/segments";
import type { OrderStatus } from "@/lib/models";
export function OrderTracker() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [order, setOrder] = useState<{
    number: number;
    status: OrderStatus;
    total_cents: number;
    payment_status: string;
  } | null>(null);
  return (
    <>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMessage("");
          setOrder(null);
          try {
            const r = await fetch("/api/track", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code: code.trim() }),
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error);
            setOrder(data);
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Não foi possível consultar.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Código de acompanhamento
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            maxLength={101}
            autoComplete="off"
          />
        </label>
        <button className="button primary" disabled={busy}>
          {busy ? "Consultando…" : "Consultar pedido"}
        </button>
      </form>
      {message && (
        <p role="alert" className="notice">
          {message}
        </p>
      )}
      {order && (
        <div className="panel">
          <h2>Pedido #{order.number}</h2>
          <p>{statusLabels[order.status]}</p>
          <strong>{money(order.total_cents)}</strong>
          <p>
            {order.payment_status === "received"
              ? "Recebimento confirmado pela loja."
              : "Pagamento no recebimento."}
          </p>
        </div>
      )}
    </>
  );
}
