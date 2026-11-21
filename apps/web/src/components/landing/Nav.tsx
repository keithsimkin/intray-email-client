"use client";

import { useEffect, useState } from "react";
import { BrandLockup } from "../Brand";
import { OsDownload } from "./platform";
import { nav } from "./site";

function sectionIdFromHref(href: string): string | null {
  if (href === "#" || href === "" || href === "/") return null;
  if (href.startsWith("#")) return href.slice(1) || null;
  return null;
}

function activeLabelFromHash(hash: string): string {
  const id = hash.replace(/^#/, "");
  if (!id) return "Home";
  const match = nav.find((item) => sectionIdFromHref(item.href) === id);
  return match?.label ?? "Home";
}

export function Nav() {
  const [activeLabel, setActiveLabel] = useState("Home");

  useEffect(() => {
    const sync = () => setActiveLabel(activeLabelFromHash(window.location.hash));
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  useEffect(() => {
    const sectionIds = nav
      .map((item) => sectionIdFromHref(item.href))
      .filter((id): id is string => Boolean(id));

    const elements = sectionIds
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (window.scrollY < 120 && !window.location.hash) {
          setActiveLabel("Home");
          return;
        }
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const top = visible[0];
        if (!top?.target.id) return;
        const match = nav.find((item) => sectionIdFromHref(item.href) === top.target.id);
        if (match) setActiveLabel(match.label);
      },
      {
        rootMargin: "-20% 0px -55% 0px",
        threshold: [0.15, 0.35, 0.55],
      },
    );

    const onScroll = () => {
      if (window.scrollY < 120 && (!window.location.hash || window.location.hash === "#")) {
        setActiveLabel("Home");
      }
    };

    for (const el of elements) observer.observe(el);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <header className="sticky top-0 z-50 px-4 pt-4">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between rounded-full border border-white/10 bg-[#121214]/80 px-3 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.55)] backdrop-blur-xl md:px-4">
        <a
          href="#"
          className="shrink-0 pl-1 text-white"
          aria-label="Intray home"
          onClick={() => setActiveLabel("Home")}
        >
          <BrandLockup markSize={20} wordHeight={16} />
        </a>
        <nav className="hidden items-center gap-1 text-sm text-white/65 lg:flex">
          {nav.map((item) => {
            const isActive = item.label === activeLabel;
            return (
              <a
                key={item.label}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`rounded-full px-3.5 py-1.5 transition hover:text-white ${
                  isActive ? "bg-white/10 text-white" : ""
                }`}
                onClick={() => setActiveLabel(item.label)}
              >
                {item.label}
              </a>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <OsDownload className="!py-2 !px-4" />
        </div>
      </div>
    </header>
  );
}
