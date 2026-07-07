import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site" data-screen-label="Footer">
      <div className="wrap">
        <div className="foot">
          <div className="about">
            <Link className="brand" href="/" style={{ color: "#fff" }}>
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
            </Link>
            <p>
              The world&apos;s first network state. Ratified MMXXVI by the Cabinet of the Republic.
              Backed by 48,392 citizens. Recognized in time.
            </p>
          </div>
          <div>
            <h4>Republic</h4>
            <Link href="/#why">Why CryptRepublic</Link>
            <Link href="/services">Citizen services</Link>
            <Link href="/#holdings">Sovereign holdings</Link>
            <Link href="/#governance">Governance</Link>
            <Link href="/#embassies">Embassies</Link>
          </div>
          <div>
            <h4>Citizens</h4>
            <Link href="/dashboard">Citizen dashboard</Link>
            <Link href="/dashboard/mint">Mint a passport</Link>
            <Link href="/dashboard/wallet">Wallet &amp; chain</Link>
            <Link href="/dashboard/holdings">Claim dividends</Link>
            <Link href="/dashboard/store">Citizen store</Link>
            <Link href="/verify">Verify a certificate</Link>
          </div>
          <div>
            <h4>Programme</h4>
            <Link href="/#how">How it works</Link>
            <Link href="/documents/constitution">The Constitution</Link>
            <Link href="/documents">Documents registry</Link>
            <Link href="/knowledge">Knowledge base</Link>
            <Link href="/brand">Brand &amp; commissary</Link>
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
