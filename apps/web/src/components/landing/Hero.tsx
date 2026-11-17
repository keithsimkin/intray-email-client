import Image from "next/image";
import { Cta } from "./Buttons";
import { GITHUB_URL } from "./site";

/** Sky stops that sit behind the transparent cloud cutout */
const SKY =
  "linear-gradient(180deg, #2579c1 0%, #4981be 28%, #6696c6 55%, #8fc7ae 100%)";

const HERO_SRC = "/hero/hero-cloud.png";

export function Hero() {
  return (
    <section className="relative isolate min-h-[100svh] overflow-hidden pb-20 pt-4 md:pb-24">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-30" style={{ background: SKY }} />

      {/* Cutout figure — black knocked out, floats on the sky */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-[6%] bottom-[18%] z-0 flex items-center justify-center md:top-[4%] md:bottom-[16%]"
      >
        <div className="relative h-full w-full max-w-4xl cloud-float">
          <Image
            src={HERO_SRC}
            alt=""
            fill
            priority
            unoptimized
            sizes="(max-width: 768px) 100vw, 896px"
            className="object-contain object-center"
          />
        </div>
      </div>

      {/* Soft fade into the white sheet below */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-28 md:h-36"
        style={{
          background: "linear-gradient(180deg, transparent 0%, #8fc7ae 88%)",
        }}
      />

      <div className="relative z-10 mx-auto flex min-h-[calc(100svh-4rem)] max-w-6xl flex-col items-center px-5">
        <div className="relative flex w-full flex-1 flex-col items-center pt-2 text-center md:pt-4">
          <h1 className="brand-rise font-display text-[clamp(4rem,14vw,9rem)] font-bold uppercase leading-[0.82] tracking-[-0.02em] text-[#c8f04a] drop-shadow-[0_2px_12px_rgba(20,60,100,0.25)]">
            Intray
          </h1>
          <p className="brand-rise brand-rise-delay-1 mt-2 font-display text-[clamp(1.4rem,4.2vw,2.6rem)] uppercase leading-none tracking-[0.06em] text-white/95 drop-shadow-[0_2px_10px_rgba(20,60,100,0.3)]">
            All your inboxes.
          </p>

          <div
            aria-hidden
            className="pointer-events-none mx-auto w-full flex-1"
            style={{ minHeight: "min(46vh, 420px)" }}
          />

          <div
            id="download"
            className="brand-rise brand-rise-delay-3 relative z-10 flex flex-col items-center gap-4 pb-2"
          >
            <Cta
              href="#pricing"
              className="!bg-[#c8f04a] !px-6 !py-3 !text-base !font-semibold !text-[#111] hover:!brightness-105"
            >
              Download
              <span className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#111] text-white">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                  <path
                    d="M2.5 9.5L9.5 2.5M9.5 2.5H4M9.5 2.5V8"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </Cta>
            <p className="max-w-md text-center text-sm font-medium text-[#1a2a1f]/85 md:text-base">
              Open-source unified mail for Windows — privacy by architecture, local AI, no mail
              relay.
            </p>
            <a
              href={GITHUB_URL}
              className="text-sm font-semibold text-[#1a2a1f]/70 underline-offset-4 transition hover:text-[#111] hover:underline"
            >
              Star us on GitHub
            </a>
          </div>
        </div>
      </div>

      <span className="sr-only">Person with laptop sitting on a cloud, working in the sky</span>
    </section>
  );
}
