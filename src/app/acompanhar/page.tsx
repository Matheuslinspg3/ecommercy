import Link from "next/link";
import { OrderTracker } from "@/components/order-tracker";
export default function TrackingPage() {
  return (
    <main id="conteudo" className="simple-page">
      <Link href="/">← Voltar à loja</Link>
      <h1>Acompanhe seu pedido.</h1>
      <p>Use o código recebido ao enviar a compra.</p>
      <OrderTracker />
    </main>
  );
}
