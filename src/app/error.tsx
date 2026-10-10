"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="conteudo" className="simple-page">
      <h1>Não foi possível carregar a loja.</h1>
      <p>As informações estão temporariamente indisponíveis.</p>
      <button className="button primary" onClick={reset}>
        Tentar novamente
      </button>
    </main>
  );
}
