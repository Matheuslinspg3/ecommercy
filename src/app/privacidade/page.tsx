import Link from "next/link";
import { loadStore } from "@/lib/server";
export default async function Privacy() {
  const { config, demo } = await loadStore();
  return (
    <main id="conteudo" className="simple-page">
      <Link href="/">← {config.name}</Link>
      <h1>Privacidade</h1>
      {demo && (
        <p className="notice">Você está em uma demonstração. Use somente dados fictícios.</p>
      )}
      <p>
        Ao fazer um pedido, você informa nome, celular e, quando necessário, endereço de entrega. A
        loja utiliza esses dados para atender, entregar e acompanhar a sua compra.
      </p>
      <p>
        O catálogo pode ser consultado sem cadastro. A cesta guarda somente os produtos escolhidos
        neste navegador. O código de acompanhamento dá acesso ao status do pedido; guarde-o com
        cuidado.
      </p>
      <p>
        A loja é responsável pelos dados dos pedidos. Para informações sobre atendimento,
        conservação ou revisão de seus dados, entre em contato pelo canal abaixo.
      </p>
      <p>
        {config.contact.email ? (
          <a href={`mailto:${config.contact.email}`}>{config.contact.email}</a>
        ) : (
          "Contato de privacidade ainda não informado pela loja."
        )}
      </p>
      <p>
        {config.name} · {config.location.address} · {config.location.city}/{config.location.state}
      </p>
      <Link href="/" className="button outline">
        Voltar à loja
      </Link>
    </main>
  );
}
