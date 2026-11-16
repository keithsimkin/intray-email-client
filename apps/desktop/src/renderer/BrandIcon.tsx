import type { CSSProperties } from "react";
import type { SimpleIcon } from "simple-icons";
import {
  siClaudecode,
  siCursor,
  siGmail,
  siGooglegemini,
  siIcloud,
  siOllama,
  siThunderbird,
  siX,
} from "simple-icons";
import openaiUrl from "./assets/brands/openai.svg?url";
import openaiDarkUrl from "./assets/brands/openai_dark.svg?url";
import outlookUrl from "./assets/brands/microsoft-outlook.svg?url";
import yahooUrl from "./assets/brands/yahoo.svg?url";
import fastmailUrl from "./assets/brands/fastmail.svg?url";
import gmailUrl from "./assets/brands/gmail.svg?url";
import type { ShortcutPackId } from "./shortcuts";

/** Render an official Simple Icons mark (real brand path data). */
export function SimpleBrandIcon({
  icon,
  size = 22,
  color,
  title,
}: {
  icon: SimpleIcon;
  size?: number;
  /** Defaults to brand hex. Pass `currentColor` for theme-aware mono marks. */
  color?: string;
  title?: string;
}) {
  const fill = color ?? `#${icon.hex}`;
  const mono = fill === "currentColor" || icon.hex.toLowerCase() === "000000";
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      style={{ flexShrink: 0, display: mono && !color ? "currentColor" : undefined }}
      fill={mono && !color ? "currentColor" : fill}
      aria-hidden={title ? undefined : true}
    >
      <title>{title ?? icon.title}</title>
      <path d={icon.path} />
    </svg>
  );
}

function ImgBrand({
  src,
  alt,
  size,
}: {
  src: string;
  alt: string;
  size: number;
}) {
  const style: CSSProperties = {
    width: size,
    height: size,
    flexShrink: 0,
    objectFit: "contain",
    display: "block",
  };
  return <img src={src} alt={alt} width={size} height={size} style={style} />;
}

export const brandIcons = {
  gmail: siGmail,
  icloud: siIcloud,
  claudeCode: siClaudecode,
  cursor: siCursor,
  ollama: siOllama,
  imap: siThunderbird,
  x: siX,
  gemini: siGooglegemini,
} as const;

export const brandImages = {
  openai: openaiUrl,
  openaiDark: openaiDarkUrl,
  outlook: outlookUrl,
  yahoo: yahooUrl,
  fastmail: fastmailUrl,
  gmail: gmailUrl,
} as const;

/** OpenAI mark that stays visible on dark UI. */
export function OpenAiBrand({ size = 22 }: { size?: number }) {
  return (
    <span className="brand-openai" style={{ width: size, height: size }}>
      <ImgBrand src={openaiUrl} alt="OpenAI" size={size} />
    </span>
  );
}

/** Real brand marks for shortcut packs (Gmail / Superhuman / Outlook). */
export function PackLogo({
  id,
  size = 22,
}: {
  id: ShortcutPackId;
  size?: number;
}) {
  switch (id) {
    case "gmail":
      return <ImgBrand src={brandImages.gmail} alt="Gmail" size={size} />;
    case "outlook":
      return <ImgBrand src={brandImages.outlook} alt="Outlook" size={size} />;
    case "superhuman":
      // Superhuman isn’t in Simple Icons; use the official stacked-plane mark.
      return (
        <svg
          role="img"
          viewBox="0 0 24 24"
          width={size}
          height={size}
          style={{ flexShrink: 0, display: "block", color: "currentColor" }}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <title>Superhuman</title>
          <path d="M16 12l4 3l-8 7l-8-7l4-3" />
          <path d="M12 3l-8 6l8 6l8-6l-8-6" />
          <path d="M12 15h8" />
        </svg>
      );
  }
}

export { ImgBrand };
