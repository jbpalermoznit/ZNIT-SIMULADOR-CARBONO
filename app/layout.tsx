import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
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
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "#56B7A5",
          colorText: "#030304",
          colorTextSecondary: "#808181",
          colorBackground: "#FFFFFF",
          colorInputBackground: "#F8FAF9",
          colorInputText: "#030304",
          borderRadius: "0.5rem",
          fontFamily: "system-ui, -apple-system, sans-serif",
        },
      }}
    >
      <html lang="pt-BR">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
