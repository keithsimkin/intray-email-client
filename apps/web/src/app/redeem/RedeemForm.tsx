"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

type RedeemOk = {
  license: string;
  email: string;
  plan: "lifetime";
  emailed: boolean;
};

export function RedeemForm() {
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<RedeemOk | null>(null);
  const [copied, setCopied] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const response = await fetch("/api/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, email }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        license?: string;
        email?: string;
        plan?: "lifetime";
        emailed?: boolean;
      };
      if (!response.ok || !data.license || !data.email) {
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }
      setResult({
        license: data.license,
        email: data.email,
        plan: "lifetime",
        emailed: Boolean(data.emailed),
      });
      setCopied(false);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function copyLicense() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.license);
      setCopied(true);
      setError(null);
    } catch {
      setCopied(false);
      setError("Select the key and copy it manually.");
    }
  }

  if (result) {
    return (
      <div className="mt-8 w-full max-w-lg text-left">
        <p className="text-sm leading-relaxed text-[#9ca3af]">
          {result.emailed
            ? `We emailed this lifetime key to ${result.email}.`
            : `Copy this lifetime key now. We couldn't email it to ${result.email}.`}
        </p>
        <label className="mt-4 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a8f98]">
          License key
          <textarea
            readOnly
            value={result.license}
            rows={4}
            className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-[#121214] px-4 py-3 font-mono text-[13px] leading-relaxed text-white outline-none"
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void copyLicense()}
            className="inline-flex items-center rounded-full bg-[#760E0A] px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
          >
            {copied ? "Copied" : "Copy key"}
          </button>
          <Link
            href="/download"
            className="inline-flex items-center rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-white transition hover:border-white/35"
          >
            Download
          </Link>
        </div>
        {error ? <p className="mt-3 text-sm text-[#f87171]">{error}</p> : null}
        <p className="mt-5 text-sm leading-relaxed text-[#9ca3af]">
          Open Intray &gt; Settings &gt; License, paste the key.
        </p>
        <p className="mt-2 text-sm text-[#8a8f98]">
          <Link href="/download?platform=mac" className="underline underline-offset-4 hover:text-white">
            Download for Mac
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="mt-8 w-full max-w-md text-left">
      <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a8f98]">
        AppSumo code
        <input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          required
          className="mt-2 w-full rounded-2xl border border-white/10 bg-[#1a1a1e] px-4 py-3 text-sm text-white outline-none transition placeholder:text-[#6b7280] focus:border-white/30"
          placeholder="Your code"
        />
      </label>
      <label className="mt-4 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a8f98]">
        Email
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          required
          className="mt-2 w-full rounded-2xl border border-white/10 bg-[#1a1a1e] px-4 py-3 text-sm text-white outline-none transition placeholder:text-[#6b7280] focus:border-white/30"
          placeholder="you@example.com"
        />
      </label>
      {error ? <p className="mt-3 text-sm text-[#f87171]">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="mt-5 inline-flex items-center rounded-full bg-[#760E0A] px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? "Checking code…" : "Redeem code"}
      </button>
    </form>
  );
}
