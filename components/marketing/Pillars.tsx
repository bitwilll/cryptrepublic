export function Pillars() {
  return (
    <section className="block" id="why" data-screen-label="Why CryptRepublic">
      <div className="wrap">
        <div className="sec-head reveal">
          <div className="kicker">Why CryptRepublic</div>
          <h2>
            A nation built for the <em>borderless century.</em>
          </h2>
          <p>
            Citizenship is minted, not granted. Every law is voted on-chain by every citizen. Every
            asset the Republic owns pays its dividends to the people.
          </p>
        </div>
        <div className="cards3">
          <article className="pillar reveal">
            <div className="icon" aria-hidden="true">
              I
            </div>
            <h3>Cryptographically sovereign identity</h3>
            <p>
              A soulbound passport you cannot lose, sell, or have revoked. Signed by the chain,
              witnessed by seven citizens, valid in perpetuity.
            </p>
            <a className="more" href="/dashboard">
              See the passport →
            </a>
          </article>
          <article className="pillar reveal" style={{ transitionDelay: ".08s" }}>
            <div className="icon" aria-hidden="true">
              II
            </div>
            <h3>Direct, total democracy</h3>
            <p>
              No representatives. No delegates. Every citizen votes on every amendment, and the
              parliament — the chain — never adjourns.
            </p>
            <a className="more" href="/dashboard">
              Explore governance →
            </a>
          </article>
          <article className="pillar reveal" style={{ transitionDelay: ".16s" }}>
            <div className="icon" aria-hidden="true">
              III
            </div>
            <h3>A share of everything</h3>
            <p>
              Real estate, patents, equity, and crypto reserves — $428M of sovereign assets owned in
              equal share by every citizen, paying quarterly dividends.
            </p>
            <a className="more" href="#holdings">
              View the holdings →
            </a>
          </article>
        </div>
      </div>
    </section>
  );
}
