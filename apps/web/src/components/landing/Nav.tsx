import { BrandLockup } from "../Brand";
import { Cta, CtaGhost } from "./Buttons";
import { GITHUB_URL, nav } from "./site";

export function Nav() {
  return (
    <header className="sticky top-0 z-50 px-4 pt-4">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between rounded-full border border-white/35 bg-white/15 px-3 shadow-[0_10px_30px_-18px_rgba(20,40,80,0.35)] backdrop-blur-xl md:px-4">
        <a href="#" className="shrink-0 pl-1 text-white" aria-label="Intray home">
          <BrandLockup markSize={20} wordHeight={16} />
        </a>
        <nav className="hidden items-center gap-1 text-sm text-white/80 lg:flex">
          {nav.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className={`rounded-full px-3.5 py-1.5 transition hover:text-white ${
                item.active ? "bg-white/20 text-white" : ""
              }`}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <CtaGhost
            href={GITHUB_URL}
            className="hidden !border-white/45 !bg-transparent !text-white hover:!border-white hover:!bg-white/15 sm:inline-flex !py-2 !px-4"
          >
            Star us on GitHub
          </CtaGhost>
          <Cta
            href="#download"
            className="!bg-[#c8f04a] !py-2 !px-4 !text-[#111] hover:!brightness-105"
          >
            Download
          </Cta>
        </div>
      </div>
    </header>
  );
}
