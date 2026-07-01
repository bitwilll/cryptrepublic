import { GovStrip } from "@/components/marketing/GovStrip";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { Reveal } from "@/components/marketing/Reveal";
import { HeroPassport } from "@/components/marketing/HeroPassport";
import { LiveTicker } from "@/components/marketing/LiveTicker";
import { Pillars } from "@/components/marketing/Pillars";
import { Steps } from "@/components/marketing/Steps";
import { HoldingsStrip } from "@/components/marketing/HoldingsStrip";
import { GovernanceStrip } from "@/components/marketing/GovernanceStrip";
import { EmbassiesStrip } from "@/components/marketing/EmbassiesStrip";
import { Testimonials } from "@/components/marketing/Testimonials";
import { FinalCTA } from "@/components/marketing/FinalCTA";
import { SiteFooter } from "@/components/marketing/SiteFooter";

export default function HomePage() {
  return (
    <>
      <GovStrip />
      <SiteHeader />
      <Reveal />
      <HeroPassport />
      <LiveTicker />
      <Pillars />
      <Steps />
      <HoldingsStrip />
      <GovernanceStrip />
      <EmbassiesStrip />
      <Testimonials />
      <FinalCTA />
      <SiteFooter />
    </>
  );
}
