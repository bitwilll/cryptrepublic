export function EmbassiesStrip() {
  return (
    <section className="block" id="embassies" data-screen-label="Embassies">
      <div className="wrap">
        <div className="sec-head reveal">
          <div className="kicker" style={{ fontSize: "16px" }}>
            Embassies
          </div>
          <h2>
            27 cities. 22 countries. <em>One Republic.</em>
          </h2>
          <p>
            Where the Republic gathers in flesh — co-working, weekly oath signings, and a standing
            invitation for every citizen.
          </p>
        </div>
        <div className="emb-chips reveal">
          <span className="chip">
            <span className="cc">TYO</span> Tokyo <span className="n">6 210</span>
          </span>
          <span className="chip">
            <span className="cc">NYC</span> New York <span className="n">5 402</span>
          </span>
          <span className="chip">
            <span className="cc">LIS</span> Lisbon <span className="n">4 108</span>
          </span>
          <span className="chip">
            <span className="cc">TLL</span> Tallinn <span className="n">3 814</span>
          </span>
          <span className="chip">
            <span className="cc">BER</span> Berlin <span className="n">3 210</span>
          </span>
          <span className="chip">
            <span className="cc">BUE</span> Buenos Aires <span className="n">2 890</span>
          </span>
          <span className="chip">
            <span className="cc">SIN</span> Singapore <span className="n">2 402</span>
          </span>
          <span className="chip">
            <span className="cc">LAG</span> Lagos <span className="n">1 894</span>
          </span>
          <span className="chip">
            <span className="cc">DXB</span> Dubai <span className="n">1 410</span>
          </span>
          <span className="chip" style={{ borderStyle: "dashed", color: "var(--muted)" }}>
            + 18 more · 4 opening Q3
          </span>
        </div>
      </div>
    </section>
  );
}
