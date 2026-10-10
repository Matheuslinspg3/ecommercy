import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { loadStore } from "@/lib/server";
import "./globals.css";
export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const store = await loadStore();
  return {
    title: { default: store.config.name, template: `%s · ${store.config.name}` },
    description: store.config.description,
    icons: { icon: store.config.branding.logo || "/commerce-mark.svg" },
    robots: { index: !store.demo && store.accepting_orders, follow: !store.demo },
  };
}
function contrast(hex: string) {
  const rgb = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((c) => {
      const n = parseInt(c, 16) / 255;
      return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
    });
  const l = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  return l > 0.179 ? "#17261E" : "#FFFFFF";
}
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { config } = await loadStore();
  const theme = {
    "--primary": config.branding.primary,
    "--primary-ink": contrast(config.branding.primary),
    "--secondary": config.branding.secondary,
    "--background": config.branding.background,
  } as CSSProperties;
  return (
    <html lang="pt-BR">
      <body style={theme}>
        <a className="skip-link" href="#conteudo">
          Pular para o conteúdo
        </a>
        {children}
      </body>
    </html>
  );
}
