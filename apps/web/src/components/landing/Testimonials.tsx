"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import { useState } from "react";

const quotes = [
  {
    body: "I wanted Superhuman-level triage on Windows without handing my mail to another cloud. Local AI plus a real tray panel is the combo.",
    name: "Maya R.",
    role: "Founder, security tooling",
    avatar: "/avatars/avatar-maya.jpg",
  },
  {
    body: "MCP that can search my inbox from Cursor — without a relay — is the reason I leave Thunderbird open less every week.",
    name: "Jon K.",
    role: "Staff engineer",
    avatar: "/avatars/avatar-noah.jpg",
  },
  {
    body: "OTP copy from the toast alone sold me. Open source means I can audit the privacy claims myself — email is too important not to.",
    name: "Priya S.",
    role: "Windows power user",
    avatar: "/avatars/avatar-priya.jpg",
  },
  {
    body: "One tray for work Gmail and personal iCloud. Archive and snooze without focusing the window — that is the Windows habit I needed.",
    name: "Daniel W.",
    role: "Product designer",
    avatar: "/avatars/avatar-daniel.jpg",
  },
];

export function Testimonials() {
  const [index, setIndex] = useState(0);
  const visible = [quotes[index % quotes.length], quotes[(index + 1) % quotes.length]];

  return (
    <section id="testimonials" className="landing-light px-5 py-14 md:py-16">
      <div className="mx-auto max-w-6xl rounded-[1.75rem] bg-[#eaf3f0] px-6 py-10 md:px-10 md:py-12">
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div>
            <h2 className="max-w-xs font-display text-[clamp(1.85rem,3.5vw,2.75rem)] uppercase leading-[0.95] tracking-[0.02em] text-[#111]">
              Customer reviews and feedback from real users
            </h2>
            <div className="mt-7 flex gap-3">
              <button
                type="button"
                aria-label="Previous reviews"
                onClick={() => setIndex((i) => (i - 1 + quotes.length) % quotes.length)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#111]/12 bg-white text-[#111] transition hover:border-[#111]/35"
              >
                <ChevronLeft size={18} strokeWidth={2} />
              </button>
              <button
                type="button"
                aria-label="Next reviews"
                onClick={() => setIndex((i) => (i + 1) % quotes.length)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#111]/12 bg-white text-[#111] transition hover:border-[#111]/35"
              >
                <ChevronRight size={18} strokeWidth={2} />
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {visible.map((q) => (
              <blockquote
                key={`${q.name}-${index}`}
                className="flex flex-col rounded-[1.25rem] bg-white p-5 shadow-[0_14px_36px_-28px_rgba(20,40,60,0.4)]"
              >
                <div className="flex items-center gap-3">
                  <Image
                    src={q.avatar}
                    alt=""
                    width={40}
                    height={40}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                  <div>
                    <p className="text-sm font-semibold text-[#111]">{q.name}</p>
                    <p className="text-xs text-[#6b7280]">{q.role}</p>
                  </div>
                </div>
                <div className="mt-3 flex gap-0.5 text-[#c8f04a]" aria-label="5 stars">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} size={13} fill="currentColor" strokeWidth={0} />
                  ))}
                </div>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-[#4a5b52]">
                  &ldquo;{q.body}&rdquo;
                </p>
              </blockquote>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
