import type { ReactNode } from "react";
import Link from "next/link";
import { CookieConsent } from "../landing/CookieConsent";
import { Footer } from "../landing/Footer";
import { Nav } from "../landing/Nav";

export const LEGAL_UPDATED = "November 21, 2026";

export function LegalDocument({
  eyebrow,
  title,
  lede,
  children,
}: {
  eyebrow: string;
  title: string;
  lede: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <div className="relative min-h-screen bg-[#070708]">
        <Nav />
        <main className="px-5 pb-20 pt-12 md:pt-16">
          <article className="mx-auto max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#c8f04a]">
              {eyebrow}
            </p>
            <h1 className="mt-3 font-display text-[clamp(2.6rem,7vw,4.5rem)] uppercase leading-[0.92] tracking-[0.02em] text-white">
              {title}
            </h1>
            <p className="mt-4 text-sm text-[#8a8f98]">Last updated {LEGAL_UPDATED}</p>
            <div className="mt-6 max-w-2xl text-[15px] leading-7 text-[#9ca3af]">{lede}</div>
            <div className="legal-body mt-10 space-y-8 text-[15px] leading-7 text-[#9ca3af] [&_a]:text-[#c8f04a] [&_a]:underline [&_a]:decoration-[#c8f04a]/40 [&_a]:underline-offset-[3px] [&_a]:hover:decoration-[#c8f04a] [&_h2]:scroll-mt-28 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-[-0.01em] [&_h2]:text-white [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5 [&_p+p]:mt-3 [&_section]:border-t [&_section]:border-white/10 [&_section]:pt-8 [&_strong]:font-semibold [&_strong]:text-white [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
              {children}
            </div>
            <p className="mt-10 text-sm text-[#8a8f98]">
              <Link href="/" className="text-[#c8f04a] hover:underline">
                Back to Intray
              </Link>
            </p>
          </article>
        </main>
      </div>
      <Footer />
      <CookieConsent />
    </>
  );
}
