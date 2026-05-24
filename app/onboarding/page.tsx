"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useOrganization, OrganizationList } from "@clerk/nextjs";
import { Leaf, Loader2 } from "lucide-react";

export default function OnboardingPage() {
  const router = useRouter();
  const { organization, isLoaded } = useOrganization();

  // Once user has an active organization, push them into the app
  useEffect(() => {
    if (isLoaded && organization) {
      router.replace("/dashboard");
    }
  }, [isLoaded, organization, router]);

  return (
    <div className="min-h-screen bg-[#F8FAF9] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 bg-[#56B7A5] rounded-xl flex items-center justify-center mb-4 shadow-[0_4px_16px_rgba(86,183,165,0.3)]">
            <Leaf size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[#030304]">Quase lá</h1>
          <p className="text-sm text-[#808181] mt-1 text-center">
            Crie sua empresa ou entre em uma já existente para começar.
          </p>
        </div>

        {!isLoaded ? (
          <div className="flex items-center justify-center gap-2 text-sm text-[#808181] py-8">
            <Loader2 size={16} className="animate-spin" />
            Carregando…
          </div>
        ) : (
          <OrganizationList
            hidePersonal
            afterCreateOrganizationUrl="/dashboard"
            afterSelectOrganizationUrl="/dashboard"
            skipInvitationScreen
          />
        )}
      </div>
    </div>
  );
}
