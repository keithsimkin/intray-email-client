import type { CSSProperties } from "react";

const RAM_PATH_32 =
  "M16.25 26.20 L16.25 23.60 Q16.25 22.20 18.00 22.20 L22.75 22.00 L25.75 19.70 L27.30 18.40 L24.50 15.20 L21.00 11.30 L17.40 8.10 L13.80 6.30 Q11.20 5.40 8.60 6.40 Q5.90 7.70 5.30 10.50 Q4.90 13.40 6.90 15.30 Q8.70 16.80 11.10 16.00 Q12.90 15.30 13.20 13.20 Q13.40 11.60 11.90 11.10 Q10.40 10.70 9.60 11.80";

const RAM_PATH_64 =
  "M32.5 52.4 L32.5 47.2 Q32.5 44.4 36.0 44.4 L45.5 44.0 L51.5 39.4 L54.6 36.8 L49.0 30.4 L42.0 22.6 L34.8 16.2 L27.6 12.6 Q22.4 10.8 17.2 12.8 Q11.8 15.4 10.6 21.0 Q9.8 26.8 13.8 30.6 Q17.4 33.6 22.2 32.0 Q25.8 30.6 26.4 26.4 Q26.8 23.2 23.8 22.2 Q20.8 21.4 19.2 23.6";

/** Compact ram mark (inherits currentColor). */
export function IntrayMark({
  size = 28,
  className,
  title = "Intray",
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label={title}
    >
      <path
        d={RAM_PATH_32}
        stroke="currentColor"
        strokeWidth="2.7"
        strokeLinecap="butt"
        strokeLinejoin="miter"
        strokeMiterlimit={8}
        fill="none"
      />
    </svg>
  );
}

/** App-tile icon for favicons / large placements. */
export function IntrayIcon({
  size = 40,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      role="img"
      aria-label="Intray"
    >
      <rect width="64" height="64" rx="14" fill="#760E0A" />
      <path
        d={RAM_PATH_64}
        stroke="#FFFFFF"
        strokeWidth="5.4"
        strokeLinecap="butt"
        strokeLinejoin="miter"
        strokeMiterlimit={8}
        fill="none"
      />
    </svg>
  );
}

export function IntrayWordmark({
  height = 28,
  className,
  showUnderline = true,
}: {
  height?: number;
  className?: string;
  showUnderline?: boolean;
}) {
  const style: CSSProperties = {
    fontSize: height * 0.78,
    letterSpacing: "-0.045em",
    fontWeight: 600,
    lineHeight: 1,
  };
  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: height * 0.12,
      }}
    >
      <span style={style}>intray</span>
      {showUnderline ? (
        <span
          aria-hidden
          style={{
            display: "block",
            width: "0.72em",
            marginLeft: "1.55em",
            height: Math.max(2, height * 0.1),
            borderRadius: 999,
            background: "var(--signal)",
            fontSize: height * 0.78,
          }}
        />
      ) : null}
    </span>
  );
}

export function BrandLockup({
  markSize = 26,
  wordHeight = 22,
  className,
}: {
  markSize?: number;
  wordHeight?: number;
  className?: string;
}) {
  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <IntrayMark size={markSize} />
      <IntrayWordmark height={wordHeight} showUnderline={false} />
    </span>
  );
}
