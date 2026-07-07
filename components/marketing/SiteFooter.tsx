export function SiteFooter() {
  return (
    <footer className="site" data-screen-label="Footer">
      <div className="wrap">
        <div className="foot">
          <div className="about">
            <a className="brand" href="/" style={{ color: "#fff" }}>
              <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
                <polygon
                  points="15,1 25,5 29,15 25,25 15,29 5,25 1,15 5,5"
                  stroke="#c8a96a"
                  strokeWidth="1.8"
                  fill="none"
                />
                <text
                  x="15"
                  y="19.5"
                  textAnchor="middle"
                  fontFamily="Newsreader,serif"
                  fontSize="11"
                  fill="#c8a96a"
                >
                  CR
                </text>
              </svg>
              CryptRepublic
            </a>
            <p>
              The world&apos;s first network state. Ratified MMXXVI by the Cabinet of the Republic.
              Backed by 48,392 citizens. Recognized in time.
            </p>
          </div>
          <div>
            <h4>Republic</h4>
            <a href="/#why">Why CryptRepublic</a>
            <a href="/services">Citizen services</a>
            <a href="/#holdings">Sovereign holdings</a>
            <a href="/#governance">Governance</a>
            <a href="/#embassies">Embassies</a>
          </div>
          <div>
            <h4>Citizens</h4>
            <a href="/dashboard">Citizen dashboard</a>
            <a href="/dashboard/mint">Mint a passport</a>
            <a href="/dashboard/wallet">Wallet &amp; chain</a>
            <a href="/dashboard/holdings">Claim dividends</a>
            <a href="/dashboard/store">Citizen store</a>
            <a href="/verify">Verify a certificate</a>
          </div>
          <div>
            <h4>Programme</h4>
            <a href="/#how">How it works</a>
            <a href="/documents/constitution">The Constitution</a>
            <a href="/documents">Documents registry</a>
            <a href="/knowledge">Knowledge base</a>
            <a href="/brand">Brand &amp; commissary</a>
          </div>
        </div>
        <div className="legal">
          <span>© CRYPTREPUBLIC · MMXXVI · NETWORK STATE №001</span>
          <span>BLOCK 21 408 932 · YOU HAVE BEEN OBSERVED</span>
        </div>
      </div>
    </footer>
  );
}
