import { NextResponse } from "next/server";

const REPO = "keithsimkin/intray-email-client";
const SETUP_RE = /^Intray-Setup-.*\.exe$/i;

type GithubAsset = {
  name: string;
  browser_download_url: string;
};

type GithubRelease = {
  assets?: GithubAsset[];
};

export async function GET() {
  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "intray-web",
      },
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      return NextResponse.redirect(
        `https://github.com/${REPO}/releases/latest`,
        302,
      );
    }

    const release = (await response.json()) as GithubRelease;
    const asset = release.assets?.find((item) => SETUP_RE.test(item.name));

    if (!asset?.browser_download_url) {
      return NextResponse.redirect(
        `https://github.com/${REPO}/releases/latest`,
        302,
      );
    }

    return NextResponse.redirect(asset.browser_download_url, 302);
  } catch {
    return NextResponse.redirect(`https://github.com/${REPO}/releases/latest`, 302);
  }
}
