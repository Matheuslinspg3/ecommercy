import Link from "next/link";
export default function NotFound() {
  return (
    <main id="conteudo" className="simple-page">
      <h1>Esta página não foi encontrada.</h1>
      <Link href="/" className="button primary">
        Voltar à loja
      </Link>
    </main>
  );
}
