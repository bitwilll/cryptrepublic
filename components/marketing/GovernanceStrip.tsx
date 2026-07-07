export function GovernanceStrip() {
  return (
    <section className="block gov" id="governance" data-screen-label="Governance">
      <div className="wrap">
        <div className="sec-head reveal">
          <div className="kicker">Governance · live</div>
          <h2>
            The parliament <em>never adjourns.</em>
          </h2>
        </div>
        <div className="vote-card reveal">
          <div>
            <div className="kicker" style={{ color: "var(--gold-d)" }}>
              AMENDMENT §47 · CLOSES IN 18H
            </div>
            <h3 style={{ marginTop: "10px" }}>
              <em>Embassy Quorum Threshold</em>
            </h3>
            <p style={{ marginTop: "12px" }}>
              Reduce the minimum citizen attestation from 100 to 73 for embassy operational quorum —
              recognising the rapid growth of new embassies across the Southern hemisphere.
            </p>
            <a
              className="btn btn-primary"
              href="/dashboard"
              style={{ marginTop: "18px", padding: "13px 22px", fontSize: "14px" }}
            >
              Cast your oath →
            </a>
          </div>
          <div className="tally">
            <div className="bar">
              <i style={{ width: "74%", background: "var(--success)" }}></i>
              <i style={{ width: "23%", background: "var(--gold)" }}></i>
              <i style={{ width: "3%", background: "#b9c3cf" }}></i>
            </div>
            <div className="legend">
              <div style={{ borderLeftColor: "var(--success)" }}>
                <span>YEA</span>
                <b>13 421</b>
              </div>
              <div style={{ borderLeftColor: "var(--gold)" }}>
                <span>NAY</span>
                <b>4 102</b>
              </div>
              <div style={{ borderLeftColor: "#b9c3cf" }}>
                <span>ABSTAIN</span>
                <b>281</b>
              </div>
            </div>
            <div
              style={{
                marginTop: "14px",
                fontFamily: "var(--mono)",
                fontSize: "11.5px",
                color: "var(--muted)",
                letterSpacing: ".06em",
              }}
            >
              QUORUM 73% REACHED · 98.6% LIFETIME PARTICIPATION
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
