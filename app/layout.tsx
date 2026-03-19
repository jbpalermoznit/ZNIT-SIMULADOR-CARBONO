import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ZNIT Carbon Calculator",
  description: "Calculadora de Carbono para projetos de construção civil",
  icons: { icon: "/ZNIT_favicon.png" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
