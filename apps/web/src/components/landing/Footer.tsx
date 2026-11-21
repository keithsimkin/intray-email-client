import Link from "next/link";
import { BrandLockup } from "../Brand";
import { ConsentSpacer } from "./CookieConsent";
import { siGithub, siX } from "simple-icons";
import { OsDownloadText } from "./platform";
import { GITHUB_URL, TWITTER_URL } from "./site";

function SimpleIcon({
  icon,
  size = 14,
}: {
  icon: { path: string; title: string };
  size?: number;
}) {
  return (
    <svg role="img" viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <title>{icon.title}</title>
      <path d={icon.path} fill="currentColor" />
    </svg>
  );
}

const links = [
  { href: "/", label: "Home" },
  { href: "/#features", label: "Features" },
  { href: "/#testimonials", label: "Testimonials" },
];

export function Footer() {
  return (
    <footer className="landing-light border-t border-white/10 bg-[#070708] px-5 pb-28 pt-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col items-center gap-8 md:flex-row md:items-center md:justify-between">
          <Link href="/" className="text-white" aria-label="Intray home">
            <BrandLockup markSize={20} wordHeight={16} />
          </Link>

          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-[#9ca3af]">
            {links.map((l) => (
              <a key={l.label} href={l.href} className="transition hover:text-white">
                {l.label}
              </a>
            ))}
            <OsDownloadText className="transition hover:text-white">
              Download App
            </OsDownloadText>
          </nav>

          <div className="flex items-center gap-2">
            <a
              href={GITHUB_URL}
              aria-label="GitHub"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/15"
            >
              <SimpleIcon icon={siGithub} />
            </a>
            <a
              href={TWITTER_URL}
              aria-label="X"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/15"
            >
              <SimpleIcon icon={siX} />
            </a>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-5 text-xs text-[#8a8f98] sm:flex-row">
          <p>© 2026 Intray. The desktop email client for Windows and macOS.</p>
          <div className="flex gap-4">
            <Link href="/terms" className="hover:text-white">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-white">
              Privacy
            </Link>
          </div>
        </div>
        <ConsentSpacer />
      </div>
    </footer>
  );
}
