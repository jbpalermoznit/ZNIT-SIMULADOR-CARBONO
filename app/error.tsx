"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#F8FAF9] flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 bg-[#FEE2E2] rounded-xl flex items-center justify-center mb-4">
            <AlertTriangle size={24} className="text-[#DC2626]" />
          </div>
          <h1 className="text-2xl font-bold text-[#030304]">Algo deu errado</h1>
          <p className="text-sm text-[#808181] mt-1">Ocorreu um erro inesperado</p>
        </div>
        <div className="bg-white rounded-xl border border-[#E0E4E3] p-6">
          <p className="text-sm text-[#404040] mb-4">
            Tente novamente. Se o problema persistir, entre em contato com o suporte.
          </p>
          {error.digest && (
            <p className="text-xs text-[#BDBDBC] mb-4 font-mono">
              ID: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            className="inline-flex items-center justify-center w-full h-10 bg-[#56B7A5] text-white text-sm font-semibold rounded-lg hover:bg-[#3EA08E] transition-colors"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    </div>
  );
}
