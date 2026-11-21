"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "intray-cookie-consent";
const CONSENT_EVENT = "intray-cookie-consent";

type Choice = "accepted" | "essential";

function persist(choice: Choice) {
  try {
    window.localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    /* private mode / blocked storage */
  }
  window.dispatchEvent(new Event(CONSENT_EVENT));
}

export function ConsentSpacer() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const read = () => {
      try {
        setVisible(!window.localStorage.getItem(STORAGE_KEY));
      } catch {
        setVisible(true);
      }
    };
    read();
    window.addEventListener(CONSENT_EVENT, read);
    return () => window.removeEventListener(CONSENT_EVENT, read);
  }, []);

  if (!visible) return null;
  return <div aria-hidden className="h-48 sm:h-36" />;
}

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(!window.localStorage.getItem(STORAGE_KEY));
    } catch {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const choose = (choice: Choice) => {
    persist(choice);
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-consent-title"
      aria-describedby="cookie-consent-desc"
      className="cookie-consent fixed inset-x-0 bottom-0 z-50 px-4 pb-4 sm:pb-5"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-4 rounded-2xl border border-white/10 bg-[#121214] p-4 shadow-[0_18px_50px_-20px_rgba(0,0,0,0.85)] sm:flex-row sm:items-center sm:gap-5 sm:p-5">
        <div className="min-w-0 flex-1">
          <p id="cookie-consent-title" className="text-sm font-semibold text-white">
            Cookies &amp; local storage
          </p>
          <p id="cookie-consent-desc" className="mt-1 text-[13px] leading-relaxed text-[#9ca3af]">
            We save this choice in local storage on your browser. The site does not set
            analytics or advertising cookies.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => choose("essential")}
            className="inline-flex h-10 items-center rounded-full border border-white/15 bg-transparent px-4 text-sm font-semibold text-white transition hover:border-white/35"
          >
            Essential only
          </button>
          <button
            type="button"
            onClick={() => choose("accepted")}
            className="inline-flex h-10 items-center rounded-full bg-[#760E0A] px-4 text-sm font-semibold text-white transition hover:brightness-110"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
