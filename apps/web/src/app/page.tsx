import { BuyBar } from "../components/landing/BuyBar";
import { UnifiedFeatures } from "../components/landing/FeatureBlocks";
import { Footer } from "../components/landing/Footer";
import { Hero } from "../components/landing/Hero";
import { Nav } from "../components/landing/Nav";
import { BottomCta } from "../components/landing/PricingCta";
import { ProductPanels } from "../components/landing/ProductPanels";
import { Testimonials } from "../components/landing/Testimonials";

export default function Home() {
  return (
    <>
      <div className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[100svh] -z-10"
          style={{
            background:
              "linear-gradient(180deg, #2579c1 0%, #4981be 28%, #6696c6 55%, #8fc7ae 100%)",
          }}
        />
        <Nav />
        <main>
          <Hero />
          <div className="landing-rest relative z-10 -mt-1 rounded-t-[2rem] bg-white pt-1 pb-8 shadow-[0_-20px_50px_-36px_rgba(20,40,80,0.22)]">
            <UnifiedFeatures />
            <ProductPanels />
            <Testimonials />
            <BottomCta />
          </div>
        </main>
      </div>
      <Footer />
      <BuyBar />
    </>
  );
}
