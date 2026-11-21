import Link from "next/link";
import { IntrayIcon } from "@/components/Brand";

export default function ThanksPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0b] px-5 py-16 text-center text-white">
      <IntrayIcon size={40} />
      <h1 className="mt-6 font-display text-[clamp(2rem,5vw,3.25rem)] uppercase tracking-[0.02em]">
        Thank you
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-[#9ca3af] md:text-[15px]">
        Your license is on the way. Check your inbox for your key, then grab the
        Windows or Mac build.
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex items-center rounded-full bg-[#760E0A] px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
      >
        Back to Intray
      </Link>
    </main>
  );
}
