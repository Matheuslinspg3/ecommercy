import Link from "next/link";
import { LoginForm } from "@/components/login-form";
import { demoMode } from "@/lib/server";
export default function LoginPage() {
  return (
    <main id="conteudo" className="simple-page">
      <Link href="/">← Voltar à loja</Link>
      <h1>Área da equipe.</h1>
      {demoMode() ? (
        <p>
          Você está em uma demonstração. <Link href="/admin">Conheça o painel.</Link>
        </p>
      ) : (
        <>
          <p>Entre para cuidar dos produtos e pedidos.</p>
          <LoginForm />
        </>
      )}
    </main>
  );
}
