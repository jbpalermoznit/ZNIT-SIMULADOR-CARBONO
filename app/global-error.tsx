"use client";

import { useEffect } from "react";

export default function GlobalRootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Root error:", error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#F8FAF9" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ maxWidth: 360, textAlign: "center" }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "#030304", margin: 0 }}>
              Erro crítico
            </h1>
            <p style={{ fontSize: 14, color: "#808181", marginTop: 8 }}>
              A aplicação encontrou um problema inesperado.
            </p>
            {error.digest && (
              <p style={{ fontSize: 12, color: "#BDBDBC", fontFamily: "monospace", marginTop: 8 }}>
                ID: {error.digest}
              </p>
            )}
            <button
              onClick={reset}
              style={{
                marginTop: 16,
                height: 40,
                padding: "0 20px",
                background: "#56B7A5",
                color: "white",
                fontSize: 14,
                fontWeight: 600,
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              Recarregar
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
