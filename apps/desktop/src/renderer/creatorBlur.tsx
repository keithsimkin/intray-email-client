import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  createCreatorBlur,
  creatorBlurOff,
  splitEmailParts,
  type CreatorBlurApi,
  type CreatorBlurPrefs,
} from "./creatorMode";

const CreatorBlurContext = createContext<CreatorBlurApi>(creatorBlurOff);

export function CreatorBlurProvider({
  prefs,
  ownEmails,
  children,
}: {
  prefs: CreatorBlurPrefs;
  ownEmails: ReadonlySet<string>;
  children: ReactNode;
}) {
  const value = useMemo(
    () => createCreatorBlur(prefs, ownEmails),
    [prefs, ownEmails],
  );
  return (
    <CreatorBlurContext.Provider value={value}>
      {children}
    </CreatorBlurContext.Provider>
  );
}

export function useCreatorBlur(): CreatorBlurApi {
  return useContext(CreatorBlurContext);
}

export function blurClass(className: string, on: boolean): string {
  return on ? `${className} creator-blur` : className;
}

/** Blur address strings inside a line. Leaves the rest of the line sharp. */
export function BlurredEmails({ text }: { text: string }) {
  const blur = useCreatorBlur();
  if (!blur.enabled || !text.includes("@")) return text;
  const parts = splitEmailParts(text);
  const masked = parts.some(
    (part) =>
      part.kind === "email" && blur.blurAddress(blur.kindForEmail(part.value)),
  );
  if (!masked) return text;
  return parts.map((part, index) =>
    part.kind === "email" && blur.blurAddress(blur.kindForEmail(part.value)) ? (
      <span key={index} className="creator-blur">
        {part.value}
      </span>
    ) : (
      <span key={index}>{part.value}</span>
    ),
  );
}
