import Image from "next/image";
import { DemoInboxApp } from "./DemoInbox";

type LaptopFrameProps = {
  /** @deprecated Screenshots removed — demo UI is rendered from app chrome. */
  src?: string;
  alt: string;
  className?: string;
  frameClassName?: string;
  priority?: boolean;
  /** Overall device width in CSS pixels */
  width?: number;
};

/**
 * Photoreal Surface Laptop 15 frame (jamesjingyi/mockup-device-frames)
 * with a CSS demo of Intray (no personal mailbox screenshots).
 */
const FRAME = {
  src: "/mockups/frame-surface-laptop-15.png",
  w: 3296,
  h: 2064,
  screen: { left: 0.121, top: 0.097, width: 0.757, height: 0.806 },
} as const;

/** Design canvas for the in-screen demo — scaled to fill the bezel hole. */
const DEMO = { w: 1280, h: 852 } as const;

export function LaptopFrame({
  alt,
  className = "",
  frameClassName = "",
  priority = false,
  width = 640,
}: LaptopFrameProps) {
  const height = Math.round(width * (FRAME.h / FRAME.w));
  const screen = {
    left: `${FRAME.screen.left * 100}%`,
    top: `${FRAME.screen.top * 100}%`,
    width: `${FRAME.screen.width * 100}%`,
    height: `${FRAME.screen.height * 100}%`,
  };
  const screenPxW = width * FRAME.screen.width;
  const scale = screenPxW / DEMO.w;

  return (
    <div
      className={`laptop-frame relative ${frameClassName} ${className}`}
      style={{ width, height }}
      role="img"
      aria-label={alt}
    >
      <div className="absolute overflow-hidden bg-[#f0f1f3]" style={screen}>
        <div
          className="origin-top-left"
          style={{
            width: DEMO.w,
            height: DEMO.h,
            transform: `scale(${scale})`,
          }}
        >
          <DemoInboxApp />
        </div>
      </div>

      <Image
        src={FRAME.src}
        alt=""
        width={FRAME.w}
        height={FRAME.h}
        priority={priority}
        sizes={`${width}px`}
        className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
        aria-hidden
      />
    </div>
  );
}
