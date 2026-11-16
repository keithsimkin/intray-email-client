import { BrandLockup } from "../Brand";
import { GITHUB_URL } from "./site";

const columns = [
  {
    title: "Product",
    links: [
      { href: "#features", label: "Features" },
      { href: "#privacy", label: "Privacy" },
      { href: "#pricing", label: "Pricing" },
      { href: "#download", label: "Download" },
    ],
  },
  {
    title: "Open source",
    links: [
      { href: GITHUB_URL, label: "GitHub" },
      { href: GITHUB_URL, label: "Issues" },
      { href: GITHUB_URL, label: "Discussions" },
      { href: "#open-source", label: "Contribute" },
    ],
  },
  {
    title: "Compare",
    links: [
      { href: "#features", label: "vs Outlook" },
      { href: "#features", label: "vs Thunderbird" },
      { href: "#features", label: "vs Superhuman" },
      { href: "#features", label: "vs Spark" },
    ],
  },
  {
    title: "Resources",
    links: [
      { href: GITHUB_URL, label: "Product plan" },
      { href: "mailto:hello@intray.app", label: "Contact" },
      { href: "#pricing", label: "License" },
      { href: GITHUB_URL, label: "Changelog" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-line bg-surface/50 px-5 pb-10 pt-14">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 md:grid-cols-[1.2fr_2fr]">
          <div>
            <BrandLockup markSize={22} wordHeight={18} />
            <p className="mt-3 max-w-xs text-sm text-muted">
              Windows unified mail. Privacy by architecture. Open source. Mobile later.
            </p>
            <div className="mt-5 flex gap-3">
              <a
                href={GITHUB_URL}
                className="rounded-full border border-line px-3 py-1.5 text-xs text-muted transition hover:text-foreground"
              >
                GitHub
              </a>
              <a
                href="mailto:hello@intray.app"
                className="rounded-full border border-line px-3 py-1.5 text-xs text-muted transition hover:text-foreground"
              >
                Email
              </a>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {columns.map((col) => (
              <div key={col.title}>
                <p className="text-sm font-medium">{col.title}</p>
                <ul className="mt-3 space-y-2 text-sm text-muted">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      <a href={l.href} className="hover:text-foreground">
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-12 flex flex-col gap-3 border-t border-line pt-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Intray. All rights reserved.</p>
          <a href="#" className="hover:text-foreground">
            Back to top ↑
          </a>
        </div>
      </div>
    </footer>
  );
}
