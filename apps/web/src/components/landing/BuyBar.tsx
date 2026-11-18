"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const perks = [
  {
    title: "Open source on purpose",
    body: "Email is sensitive — audit the code, prove there's no relay.",
  },
  {
    title: "Bring your AI",
    body: "Claude, OpenAI, Grok, Gemini, or Ollama — your keys, your sub.",
  },
  {
    title: "Private by design",
    body: "Straight to Gmail, Outlook, iCloud, IMAP. No Intray servers.",
  },
  {
    title: "Support if it helps",
    body: "$10/mo or a one-time gift — keep the project shipping.",
  },
] as const;

const CONSENT_EVENT = "intray-cookie-consent";

export function BuyBar() {
  const [shown, setShown] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [consentVisible, setConsentVisible] = useState(false);

  useEffect(() => {
    const hero = document.getElementById("download");
    const footer = document.querySelector("footer");

    const update = () => {
      const pastHero = hero
        ? hero.getBoundingClientRect().bottom < window.innerHeight * 0.35
        : window.scrollY > window.innerHeight * 0.55;
      const nearFooter = footer
        ? footer.getBoundingClientRect().top < window.innerHeight - 24
        : false;
      setShown(pastHero && !nearFooter);
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    const readConsent = () => {
      try {
        setConsentVisible(!window.localStorage.getItem("intray-cookie-consent"));
      } catch {
        setConsentVisible(true);
      }
    };
    readConsent();
    window.addEventListener(CONSENT_EVENT, readConsent);
    return () => window.removeEventListener(CONSENT_EVENT, readConsent);
  }, []);

  useEffect(() => {
    if (!shown) setExpanded(false);
  }, [shown]);

  const scrollToPricing = () => {
    const el = document.getElementById("pricing");
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div
      className={`buybar fixed inset-x-0 z-40 px-4${shown ? " buybar-shown" : ""}${
        expanded ? " buybar-expanded" : ""
      }${consentVisible ? " buybar-above-consent" : ""}`}
    >
      <div
        className="buybar-pill mx-auto max-w-xl rounded-[29px] border border-white/10"
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
      >
        <div id="buybar-details" className="buybar-more" aria-hidden={!expanded}>
          <div className="min-h-0 overflow-hidden">
            <div className="px-5 pb-2 pt-5">
              <p className="text-[13px] font-medium text-white/55">
                Free and open source — support optional
              </p>
              <ul className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
                {perks.map((p) => (
                  <li key={p.title} className="flex gap-2.5">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="mt-0.5 size-4 shrink-0 text-[#c8f04a]"
                      aria-hidden
                    >
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                    <div className="leading-snug">
                      <div className="text-sm font-medium text-white">{p.title}</div>
                      <div className="mt-0.5 text-[13px] text-white/55">{p.body}</div>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-4 border-t border-white/[0.08] pt-3 text-[13px] text-white/55">
                Fork, audit, and build with us — or chip in $10/mo or a one-time gift.
              </p>
            </div>
          </div>
        </div>

        <div className="buybar-content flex min-w-0 items-center gap-3 py-2 pl-3 pr-2">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
            aria-expanded={expanded}
            aria-controls="buybar-details"
            onClick={() => setExpanded((v) => !v)}
          >
            <Image
              src="/icon.png"
              alt=""
              width={32}
              height={32}
              className="size-8 rounded-lg"
            />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm font-semibold text-white">Intray for Windows</div>
              <div className="truncate text-xs text-white/55">
                Open source · $10/mo or give once
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={scrollToPricing}
            className="inline-flex h-10 shrink-0 items-center rounded-full bg-[#760E0A] px-4 text-sm font-semibold text-white transition hover:brightness-110 sm:px-5"
          >
            Support · $10/mo
          </button>
        </div>
      </div>
    </div>
  );
}
