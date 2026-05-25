import { SignIn } from "@clerk/nextjs";
import Image from "next/image";

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-[#F8FAF9] flex items-center justify-center p-4">
      <div className="w-full max-w-md flex flex-col items-center">
        <Image
          src="/ZNIT_Logo.png"
          alt="ZNIT"
          width={320}
          height={96}
          priority
          className="h-20 w-auto mb-2"
        />
        <p className="text-sm text-[#808181] mb-6">Simulador de Carbono</p>
        <SignIn
          appearance={{
            elements: {
              logoBox: "hidden",
              headerTitle: "text-[#030304]",
            },
          }}
        />
      </div>
    </div>
  );
}
