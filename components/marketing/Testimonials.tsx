export function Testimonials() {
  return (
    <section className="block gov" data-screen-label="Citizen voices">
      <div className="wrap">
        <div className="sec-head reveal">
          <div className="kicker">Voices of the Republic</div>
          <h2>
            Why citizens <em>stayed.</em>
          </h2>
        </div>
        <div className="quotes">
          <article className="quote reveal">
            <div
              className="avatar"
              style={{ background: "linear-gradient(135deg,#1957d3,#0a2540)" }}
            >
              CS
            </div>
            <p>
              &quot;I was a tax resident of three countries before CryptRepublic. Now I am a citizen
              of one — and it answers only to its citizens.&quot;
            </p>
            <footer>
              <b>Christine Sidonie</b>
              <span>CITIZEN №01 482 · LISBON</span>
            </footer>
          </article>
          <article className="quote reveal" style={{ transitionDelay: ".08s" }}>
            <div
              className="avatar"
              style={{ background: "linear-gradient(135deg,#0e3a9b,#0a1929)" }}
            >
              GK
            </div>
            <p>
              &quot;The passport cannot be sold. That alone changed how I think about identity. Six
              months in, the Republic feels more real than my birth nation.&quot;
            </p>
            <footer>
              <b>Georg Klausner</b>
              <span>CITIZEN №02 117 · VIENNA</span>
            </footer>
          </article>
          <article className="quote reveal" style={{ transitionDelay: ".16s" }}>
            <div
              className="avatar"
              style={{ background: "linear-gradient(135deg,#00b3e6,#1957d3)" }}
            >
              PA
            </div>
            <p>
              &quot;I voted on fourteen amendments last month — and my dividend arrived the same
              morning. Try doing that in a representative democracy.&quot;
            </p>
            <footer>
              <b>Dr. Priya Abraham</b>
              <span>CITIZEN №03 408 · LONDON</span>
            </footer>
          </article>
        </div>
      </div>
    </section>
  );
}
