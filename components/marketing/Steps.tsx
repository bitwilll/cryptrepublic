export function Steps() {
  return (
    <section className="block gov" id="how" data-screen-label="How it works">
      <div className="wrap">
        <div className="sec-head reveal">
          <div className="kicker">How it works</div>
          <h2>
            Three steps to <em>citizenship.</em>
          </h2>
        </div>
        <div className="steps reveal">
          <div className="step">
            <div className="bar"></div>
            <div className="n">
              STEP 01 <small>· ~3 minutes</small>
            </div>
            <h3>Attest &amp; swear the oath</h3>
            <p>
              Inscribe your name, bind the oath of entry, and choose the motto that will live on
              your passport forever.
            </p>
          </div>
          <div className="step">
            <div className="bar" style={{ opacity: 0.55 }}></div>
            <div className="n">
              STEP 02 <small>· ~24 hours</small>
            </div>
            <h3>Seven witnesses sign</h3>
            <p>
              Citizens of three years&apos; standing attest your induction. Their signatures are
              bound to your credential in perpetuity.
            </p>
          </div>
          <div className="step">
            <div className="bar" style={{ opacity: 0.3 }}></div>
            <div className="n">
              STEP 03 <small>· next block</small>
            </div>
            <h3>Sealed on chain</h3>
            <p>
              Your passport is minted soulbound. Voting power activates in 72 hours — and your first
              dividend accrues from day one.
            </p>
          </div>
        </div>
        <div style={{ marginTop: "32px", display: "flex", justifyContent: "center" }}>
          <a className="btn btn-primary reveal" href="/dashboard">
            Begin your application →
          </a>
        </div>
      </div>
    </section>
  );
}
