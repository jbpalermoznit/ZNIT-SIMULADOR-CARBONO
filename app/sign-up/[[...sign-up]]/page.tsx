import { SignUp } from "@clerk/nextjs";
import Image from "next/image";

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-[#F8FAF9] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <Image
            src="/ZNIT_Logo.png"
            alt="ZNIT"
            width={140}
            height={48}
            priority
            className="h-12 w-auto mb-3"
          />
          <p className="text-sm text-[#808181]">Crie sua conta</p>
        </div>
        <SignUp />
      </div>
    </div>
  );
}
