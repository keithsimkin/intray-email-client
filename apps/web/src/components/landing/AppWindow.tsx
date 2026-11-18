import { DemoInboxApp } from "./DemoInbox";

/** Design canvas for the in-page demo — scaled to fill the window. */
const DEMO = { w: 1280, h: 852 } as const;

type AppWindowProps = {
  alt: string;
  className?: string;
};

/**
 * Bare Intray chrome — no device frame — sized for landing sections.
 */
export function AppWindow({ alt, className = "" }: AppWindowProps) {
  return (
    <div
      className={`@container relative w-full overflow-hidden rounded-2xl border border-white/10 bg-[#121214] shadow-[0_24px_60px_-28px_rgba(0,0,0,0.85)] ${className}`}
      style={{ aspectRatio: `${DEMO.w} / ${DEMO.h}` }}
      role="img"
      aria-label={alt}
    >
      <div
        className="origin-top-left"
        style={{
          width: DEMO.w,
          height: DEMO.h,
          transform: `scale(calc(100cqw / ${DEMO.w}))`,
        }}
      >
        <DemoInboxApp />
      </div>
    </div>
  );
}
