import type { Metadata } from "next";
import { Bebas_Neue, Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { SITE_URL } from "../components/landing/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const display = Bebas_Neue({
  weight: "400",
  variable: "--font-bebas",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Intray — Get ahead of every inbox",
  description:
    "The AI desktop email client for Windows. Unify Gmail, Outlook, iCloud, and IMAP — then draft and triage with Claude, OpenAI, Grok, Gemini, or local Ollama. MCP for Cursor. No mail relay. $10/mo or $75 lifetime.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon.png", type: "image/png", sizes: "256x256" },
    ],
    apple: [{ url: "/icon.png" }],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-[#070708] text-[#ededed]">
        {children}
        <Script
          src="https://www.ship-or-die.com/hackathon/verify.js"
          strategy="afterInteractive"
          data-site="6717b71973f7ad5cc6fc83bd23d82e503d07a4f1"
        />
      </body>
    </html>
  );
}
