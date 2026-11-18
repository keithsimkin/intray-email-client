import { NextResponse } from "next/server";

const REPO = "keithsimkin/intray-email-client";
const SETUP_RE = /^Intray-Setup-.*\.exe$/i;
const ANY_WIN_EXE_RE = /^Intray-.*\.exe$/i;

type GithubAsset = {
  name: string;
  browser_download_url: string;
};

type GithubRelease = {
  tag_name?: string;
  assets?: GithubAsset[];
};

function pickWindowsInstaller(assets: GithubAsset[] | undefined): GithubAsset | undefined {
  if (!assets?.length) return undefined;
  return (
    assets.find((item) => SETUP_RE.test(item.name)) ??
    assets.find((item) => ANY_WIN_EXE_RE.test(item.name))
  );
}

function redirectTo(url: string) {
  const response = NextResponse.redirect(url, 302);
  // Always re-resolve latest release — don't let browsers/CDN keep an old installer URL.
  response.headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
  return response;
}

export async function GET() {
  const releasesLatest = `https://github.com/${REPO}/releases/latest`;

  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "intray-web",
      },
      // Fresh enough for new releases without hammering GitHub on every click.
      next: { revalidate: 60 },
    });

    if (!response.ok) {
      return redirectTo(releasesLatest);
    }

    const release = (await response.json()) as GithubRelease;
    const asset = pickWindowsInstaller(release.assets);

    if (!asset?.browser_download_url) {
      return redirectTo(releasesLatest);
    }

    return redirectTo(asset.browser_download_url);
  } catch {
    return redirectTo(releasesLatest);
  }
}
