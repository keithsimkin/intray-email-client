import { connection, NextResponse } from "next/server";

const REPO = "keithsimkin/intray-email-client";
const SETUP_RE = /^Intray-Setup-.*\.exe$/i;
const ANY_WIN_EXE_RE = /^Intray-.*\.exe$/i;
const MAC_DMG_RE = /^Intray-.*\.dmg$/i;

type GithubAsset = {
  name: string;
  browser_download_url: string;
};

type GithubRelease = {
  tag_name?: string;
  assets?: GithubAsset[];
};

type Platform = "windows" | "mac";

function platformFrom(request: Request): Platform {
  const value = new URL(request.url).searchParams.get("platform")?.toLowerCase();
  if (value === "mac" || value === "macos" || value === "darwin") return "mac";
  return "windows";
}

function pickInstaller(assets: GithubAsset[] | undefined, platform: Platform): GithubAsset | undefined {
  if (!assets?.length) return undefined;
  if (platform === "mac") {
    const dmgs = assets.filter((item) => MAC_DMG_RE.test(item.name));
    return dmgs.find((item) => /arm64/i.test(item.name)) ?? dmgs[0];
  }
  return (
    assets.find((item) => SETUP_RE.test(item.name)) ??
    assets.find((item) => ANY_WIN_EXE_RE.test(item.name))
  );
}

function redirectTo(url: string) {
  const response = NextResponse.redirect(url, 302);
  // The installer URL changes with every release. Don't let a browser or the
  // Netlify CDN keep a redirect to an older file.
  response.headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
  response.headers.set("Netlify-CDN-Cache-Control", "no-store");
  return response;
}

export async function GET(request: Request) {
  // cacheComponents would prerender this handler around a cached GitHub
  // response, so a deploy could keep sending an old installer.
  await connection();

  const platform = platformFrom(request);
  const releasesLatest = `https://github.com/${REPO}/releases/latest`;

  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "intray-web",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return redirectTo(releasesLatest);
    }

    const release = (await response.json()) as GithubRelease;
    const asset = pickInstaller(release.assets, platform);

    if (!asset?.browser_download_url) {
      return redirectTo(releasesLatest);
    }

    return redirectTo(asset.browser_download_url);
  } catch {
    return redirectTo(releasesLatest);
  }
}
