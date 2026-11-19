"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import { Cta } from "./Buttons";
import { MAC_DOWNLOAD_URL, WINDOWS_DOWNLOAD_URL } from "./site";

export type DesktopPlatform = "windows" | "mac";

type DownloadOffer = {
  platform: DesktopPlatform;
  href: string;
  label: string;
  icon: string;
  note: string;
};

const OFFERS: Record<DesktopPlatform, DownloadOffer> = {
  windows: {
    platform: "windows",
    href: WINDOWS_DOWNLOAD_URL,
    label: "Download for Windows",
    icon: "/logos/windows.png",
    note: "Follows the latest Windows release.",
  },
  mac: {
    platform: "mac",
    href: MAC_DOWNLOAD_URL,
    label: "Download for Mac",
    icon: "/logos/apple.png",
    note: "The Mac build hasn’t been tested yet.",
  },
};

/** Anything that is not a Mac gets the Windows build. */
function platformFromNavigator(): DesktopPlatform {
  const ua = navigator.userAgent ?? "";
  const platform = navigator.platform ?? "";
  if (
    /Mac|iPhone|iPad|iPod/i.test(platform) ||
    /Macintosh|Mac OS X|iPhone|iPad|iPod/i.test(ua)
  ) {
    return "mac";
  }
  return "windows";
}

function useDownloadOffer(): DownloadOffer {
  const [platform, setPlatform] = useState<DesktopPlatform>("windows");
  useEffect(() => {
    setPlatform(platformFromNavigator());
  }, []);
  return OFFERS[platform];
}

function PlatformIcon({ src }: { src: string }) {
  return (
    <Image
      src={src}
      alt=""
      width={128}
      height={128}
      className="size-4 object-contain"
      unoptimized
    />
  );
}

/** One download control for the visitor’s system. */
export function OsDownload({
  labeled = false,
  showNote = false,
  className = "",
}: {
  labeled?: boolean;
  showNote?: boolean;
  className?: string;
}) {
  const offer = useDownloadOffer();
  const icon = <PlatformIcon src={offer.icon} />;
  const button = labeled ? (
    <a
      href={offer.href}
      className={`inline-flex items-center justify-center gap-2.5 rounded-full bg-[#760E0A] px-6 py-3 text-sm font-semibold text-white shadow-[0_16px_36px_-18px_rgba(118,14,10,0.7)] transition hover:brightness-110 ${className}`}
    >
      {icon}
      {offer.label}
    </a>
  ) : (
    <Cta href={offer.href} className={className}>
      {icon}
      Download
    </Cta>
  );
  if (!showNote) return button;
  return (
    <>
      {button}
      <p className="max-w-md text-xs leading-relaxed text-white/45">{offer.note}</p>
    </>
  );
}

/** Footer text link that follows the same system choice. */
export function OsDownloadText({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const offer = useDownloadOffer();
  return (
    <a href={offer.href} className={className}>
      {children}
    </a>
  );
}
