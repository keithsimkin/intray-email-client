import type { Metadata } from "next";
import Link from "next/link";
import { IntrayIcon } from "@/components/Brand";
import { CookieConsent } from "@/components/landing/CookieConsent";
import { Footer } from "@/components/landing/Footer";
import { Nav } from "@/components/landing/Nav";
import { RedeemForm } from "./RedeemForm";

export const metadata: Metadata = {
  title: "Redeem AppSumo code — Intray",
  description:
    "Redeem an AppSumo code for an Intray lifetime license. The key is checked offline in the desktop app.",
  alternates: { canonical: "/redeem" },
};

export default function RedeemPage() {
  return (
    <>
      <div className="relative min-h-screen bg-[#070708]">
        <Nav />
        <main className="flex flex-col items-center px-5 pb-20 pt-16 text-center text-white md:pt-20">
          <IntrayIcon size={40} />
          <h1 className="mt-6 font-display text-[clamp(2.4rem,6vw,4rem)] uppercase leading-[0.92] tracking-[0.02em]">
            Redeem AppSumo code
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-[#9ca3af] md:text-[15px]">
            Enter the code from AppSumo and the email that should hold the lifetime license.
            The same code and email can be submitted again to show the same key.
          </p>
          <RedeemForm />
          <Link href="/" className="mt-10 text-sm text-[#8a8f98] hover:text-white">
            Back to Intray
          </Link>
        </main>
      </div>
      <Footer />
      <CookieConsent />
    </>
  );
}
