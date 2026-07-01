import { LiveNumber } from "@/components/ui/LiveNumber";

export function HoldingsStrip() {
  return (
    <section className="block holdings" id="holdings" data-screen-label="Sovereign holdings">
      <div className="wrap">
        <div className="sec-head reveal">
          <div className="kicker" style={{ fontSize: "17px" }}>
            Sovereign holdings
          </div>
          <h2>
            Owned by the Republic. <em>Paid to the people.</em>
          </h2>
          <p>
            Every parcel of land, every patent, every stake and every coin is held in equal share by
            every citizen — with dividends settled on chain, every quarter, without exception.
          </p>
        </div>

        <div className="aum reveal">
          <b>
            <LiveNumber value={428} prefix="$" suffix=".4M" />
          </b>
          <span className="delta">▲ +12.4% YoY · audited on chain</span>
        </div>

        <div className="hold-grid">
          <div className="hold reveal">
            <div className="hk">REAL ESTATE · 7 TITLES</div>
            <b>$173.5M</b>
            <span>
              Embassies in Lisbon, Tokyo, New York, Berlin &amp; more — plus 3,800 ha of farmland
              and an 820-acre solar estate.
            </span>
          </div>
          <div className="hold reveal" style={{ transitionDelay: ".07s" }}>
            <div className="hk">PATENTS &amp; IP · 4 FAMILIES</div>
            <b>$51.0M</b>
            <span>
              Granted patents on soulbound credentials, pseudonymous voting and embassy interop —
              licensed across 40+ jurisdictions.
            </span>
          </div>
          <div className="hold reveal" style={{ transitionDelay: ".14s" }}>
            <div className="hk">EQUITY STAKES · 3 POSITIONS</div>
            <b>$133.4M</b>
            <span>
              Validator pool §14 (16% of network), Republic Bridge Inc., and the Translation Council
              operating company.
            </span>
          </div>
          <div className="hold reveal" style={{ transitionDelay: ".21s" }}>
            <div className="hk">CRYPTO RESERVES</div>
            <b>$99.4M</b>
            <span>
              Stablecoin, Bitcoin and staked-Ethereum reserves held in 4-of-7 multisig cold storage.
              Fully transparent.
            </span>
          </div>
        </div>

        <div className="divid">
          <div className="doctrine reveal">
            <p>
              &quot;Every parcel of land. Every patent granted. Every equity stake taken. Every coin
              reserved. All of it is owned, in equal share, by every citizen of the Republic.&quot;
            </p>
            <cite>— CONSTITUTION ART. IV §1 · RATIFIED MMXXVI</cite>
          </div>
          <div className="claim reveal" style={{ transitionDelay: ".1s" }}>
            <div className="hk">YOUR QUARTERLY DIVIDEND</div>
            <b>$138.50</b>
            <span>per citizen · paid in $CRYPT · next vest 2026.06.30</span>
            <a
              className="btn btn-gold"
              href="/dashboard"
              style={{ marginTop: "22px", alignSelf: "flex-start" }}
            >
              Claim in the dashboard →
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
