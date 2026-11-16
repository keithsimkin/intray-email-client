import { Ban } from "lucide-react";
import {
  OpenAiBrand,
  SimpleBrandIcon,
  brandIcons,
} from "./BrandIcon";
import type { AiBridgeId } from "./preferences";

/** Official brand marks for the local AI bridge picker. */
export function BridgeLogo({
  id,
  size = 22,
}: {
  id: AiBridgeId;
  size?: number;
}) {
  switch (id) {
    case "openai":
    case "codex":
      return <OpenAiBrand size={size} />;
    case "grok":
      return (
        <SimpleBrandIcon
          icon={brandIcons.x}
          size={size}
          color="currentColor"
          title="Grok"
        />
      );
    case "anthropic":
    case "claude-code":
      return <SimpleBrandIcon icon={brandIcons.claudeCode} size={size} />;
    case "gemini":
      return <SimpleBrandIcon icon={brandIcons.gemini} size={size} />;
    case "cursor":
      return (
        <SimpleBrandIcon
          icon={brandIcons.cursor}
          size={size}
          color="currentColor"
        />
      );
    case "ollama":
      return (
        <SimpleBrandIcon
          icon={brandIcons.ollama}
          size={size}
          color="currentColor"
        />
      );
    case "opencode":
    case "none":
      return <Ban size={size} strokeWidth={1.75} aria-hidden />;
  }
}

/** Icon row — API providers first, then local CLIs. */
export const bridgePickerOrder: AiBridgeId[] = [
  "openai",
  "grok",
  "anthropic",
  "gemini",
  "ollama",
  "claude-code",
  "codex",
  "cursor",
  "none",
];
