export function FinalCTA() {
  return (
    <section className="block cta" data-screen-label="Final CTA">
      <div className="wrap">
        <div className="reveal">
          <div className="kicker" style={{ color: "var(--gold)", fontSize: "17px" }}>
            The census is open
          </div>
          <h2 style={{ marginTop: "12px" }}>
            One passport. One oath.
            <br />
            <em>One Republic.</em>
          </h2>
          <p>
            Mint your soulbound passport, claim your share of the sovereign estate, and take your
            seat in a parliament that never adjourns.
          </p>
          <div className="hero-ctas" style={{ marginTop: "34px" }}>
            <a className="btn btn-gold" href="/dashboard">
              Mint passport №48 393 →
            </a>
            <a className="btn btn-dark" href="#why">
              Read more first
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
