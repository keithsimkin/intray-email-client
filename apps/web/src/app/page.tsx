import { BuyBar } from "../components/landing/BuyBar";
import { CookieConsent } from "../components/landing/CookieConsent";
import { UnifiedFeatures } from "../components/landing/FeatureBlocks";
import { Footer } from "../components/landing/Footer";
import { Hero } from "../components/landing/Hero";
import { Nav } from "../components/landing/Nav";
import { BottomCta } from "../components/landing/PricingCta";
import { Testimonials } from "../components/landing/Testimonials";

export default function Home() {
  return (
    <>
      <div className="relative bg-black">
        <Nav />
        <main>
          <Hero />
          <div className="landing-rest relative z-10 bg-black pb-8 pt-2">
            <UnifiedFeatures />
            <Testimonials />
            <BottomCta />
          </div>
        </main>
      </div>
      <Footer />
      <BuyBar />
      <CookieConsent />
    </>
  );
}
