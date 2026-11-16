import { BrandLockup } from "../Brand";
import { Cta, CtaGhost } from "./Buttons";
import { GITHUB_URL, nav } from "./site";

export function Nav() {
  return (
    <header className="sticky top-0 z-50 px-4 pt-4">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between rounded-full border border-line bg-surface/90 px-3 shadow-[var(--shadow-soft)] backdrop-blur-xl md:px-4">
        <a href="#" className="shrink-0 pl-1 text-foreground" aria-label="Intray home">
          <BrandLockup markSize={20} wordHeight={16} />
        </a>
        <nav className="hidden items-center gap-1 text-sm text-muted lg:flex">
          {nav.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className={`rounded-full px-3.5 py-1.5 transition hover:text-foreground ${
                item.active ? "bg-signal-soft text-signal" : ""
              }`}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <CtaGhost href={GITHUB_URL} className="hidden sm:inline-flex !py-2 !px-4">
            GitHub
          </CtaGhost>
          <Cta href="#download" className="!py-2 !px-4">
            Download
          </Cta>
        </div>
      </div>
    </header>
  );
}
