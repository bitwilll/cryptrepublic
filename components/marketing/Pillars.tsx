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
            <div className="icon">
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                stroke="#1957d3"
                strokeWidth="1.7"
                fill="none"
              >
                <rect x="5" y="3" width="14" height="18" rx="2" />
                <circle cx="12" cy="10" r="3" />
                <path d="M9 16h6M9 18.5h6" />
              </svg>
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
            <div className="icon">
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                stroke="#1957d3"
                strokeWidth="1.7"
                fill="none"
              >
                <path d="M3 21h18M3 21V10l9-6 9 6v11M7.5 21v-8M12 21v-8M16.5 21v-8" />
              </svg>
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
            <div className="icon">
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                stroke="#1957d3"
                strokeWidth="1.7"
                fill="none"
              >
                <polygon points="12,3 21,7.5 21,16.5 12,21 3,16.5 3,7.5" />
                <polyline points="3,7.5 12,12 21,7.5" />
                <line x1="12" y1="12" x2="12" y2="21" />
              </svg>
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
