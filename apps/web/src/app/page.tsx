import { AiAndAgents, UnifiedFeatures } from "../components/landing/FeatureBlocks";
import { Footer } from "../components/landing/Footer";
import { Hero } from "../components/landing/Hero";
import { Nav } from "../components/landing/Nav";
import { BottomCta, Pricing } from "../components/landing/PricingCta";
import { ProductPanels } from "../components/landing/ProductPanels";
import { Stats } from "../components/landing/Stats";
import { Testimonials } from "../components/landing/Testimonials";
import { Cta } from "../components/landing/Buttons";

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <UnifiedFeatures />
        <AiAndAgents />
        <Stats />
        <ProductPanels />
        <Testimonials />
        <Pricing />
        <BottomCta />
      </main>
      <Footer />

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-background/90 px-4 py-3 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <p className="text-xs text-muted">7-day trial · then $4.99 · OSS</p>
          <Cta href="#download" className="!py-2 !px-4">
            Download
          </Cta>
        </div>
      </div>
    </>
  );
}
