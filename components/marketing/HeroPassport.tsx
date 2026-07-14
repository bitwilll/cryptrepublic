"use client";

import { Crest } from "@/components/brand/Crest";
import { LiveNumber } from "@/components/ui/LiveNumber";
import { usePassportBook } from "@/lib/hooks/usePassportBook";
import { useGenerativeArt } from "@/lib/hooks/useGenerativeArt";

export function HeroPassport() {
  const { open, onClick, onKeyDown } = usePassportBook();
  const { qr, nft } = useGenerativeArt();

  return (
    <section className="hero" id="top" data-screen-label="Hero">
      <div className="wrap">
        <div className="hero-poster">
          <span className="badge" style={{ fontSize: "14px" }}>
            <span className="dot"></span> Ratified by the Cabinet · 48,392 citizens &amp; counting
          </span>

          {/* The engraved masthead. The h1 must keep containing "NETWORK STATE"
              (e2e/home.spec.ts) — the ghost line carries it. */}
          <h1 className="display-title">
            <span className="mask-line">
              <span style={{ animationDelay: "0.05s" }}>CRYPT</span>
            </span>
            <span className="mask-line">
              <span style={{ animationDelay: "0.16s" }}>REPUBLIC</span>
            </span>
            <span className="mask-line">
              <span className="display-ghost" style={{ animationDelay: "0.3s" }}>
                The first network state.
              </span>
            </span>
          </h1>

          <div className="hero-lede-row">
            <div className="hero-facts" data-parallax data-parallax-speed="-0.04">
              <div className="facts-head">THE FACTS</div>
              <dl>
                <div className="fact">
                  <dt>C.</dt>
                  <dd>
                    <LiveNumber value={48392} /> citizens
                  </dd>
                </div>
                <div className="fact">
                  <dt>N.</dt>
                  <dd>
                    <LiveNumber value={91} /> countries
                  </dd>
                </div>
                <div className="fact">
                  <dt>E.</dt>
                  <dd>
                    <LiveNumber value={27} /> embassies
                  </dd>
                </div>
                <div className="fact">
                  <dt>A.</dt>
                  <dd>
                    <LiveNumber value={428} prefix="$" suffix="M" /> sovereign assets
                  </dd>
                </div>
                <div className="fact">
                  <dt>R.</dt>
                  <dd>Ratified MMXXVI</dd>
                </div>
              </dl>
            </div>
            <div>
              <p className="lede">
                A sovereign collective without territory. Mint a soulbound passport, vote on every
                law, share in the Republic&apos;s assets, and reside in 27 embassies worldwide.
              </p>
              <div className="hero-ctas">
                <a className="btn btn-primary" href="/dashboard">
                  Mint your passport →
                </a>
                <a className="btn btn-ghost" href="#how">
                  See how it works
                </a>
              </div>
            </div>
          </div>

          <div className="hero-sticker passport-stage" data-parallax data-parallax-speed="0.06">
            <div className="pb-float">
              <div
                className={`passport-book${open ? " open" : ""}`}
                id="passportBook"
                tabIndex={0}
                role="button"
                aria-label="Specimen passport — hover or tap to open the bio-data page"
                onClick={onClick}
                onKeyDown={onKeyDown}
              >
                {/* bio-data page (revealed when the cover opens) */}
                <div className="pb-inside">
                  <Crest tone="dark" className="dp-watermark" alt="" />
                  <div className="dp-head">
                    <span>CRYPTREPUBLIC · NETWORK STATE №001</span>
                    <span>PASSPORT / PASSEPORT</span>
                  </div>
                  <div className="dp-body">
                    <div className="dp-top">
                      <div className="dp-photo">
                        <svg viewBox="0 0 92 118" width="92" height="118" aria-hidden="true">
                          <rect width="92" height="118" fill="#dfdacb" />
                          <circle cx="46" cy="44" r="21" fill="#9aa5b4" />
                          <path d="M 12 118 Q 12 76 46 76 Q 80 76 80 118 Z" fill="#9aa5b4" />
                          <rect
                            x="30"
                            y="24"
                            width="32"
                            height="14"
                            rx="0"
                            fill="#7d8896"
                            opacity=".85"
                          />
                          <text
                            x="46"
                            y="112"
                            textAnchor="middle"
                            fontSize="5"
                            fill="#8a93a3"
                            letterSpacing="1"
                          >
                            DIGITAL LIKENESS
                          </text>
                        </svg>
                        <i className="dp-holo"></i>
                        <b className="dp-corner tl"></b>
                        <b className="dp-corner br"></b>
                      </div>
                      <div className="dp-fields">
                        <div>
                          <span>TYPE</span>
                          <b>P</b>
                        </div>
                        <div>
                          <span>PASSPORT №</span>
                          <b>NS-0000001</b>
                        </div>
                        <div className="w">
                          <span>SURNAME</span>
                          <b>NAKAMOTO</b>
                        </div>
                        <div className="w">
                          <span>GIVEN NAMES</span>
                          <b>SATOSHI</b>
                        </div>
                        <div>
                          <span>CITIZEN №</span>
                          <b>00 001 · GENESIS</b>
                        </div>
                        <div>
                          <span>NATIONALITY</span>
                          <b>CRYPTREPUBLICAN</b>
                        </div>
                        <div>
                          <span>INDUCTED</span>
                          <b>03 JAN 2009</b>
                        </div>
                        <div>
                          <span>EXPIRY</span>
                          <b style={{ color: "var(--gold-d)" }}>PERPETUAL</b>
                        </div>
                      </div>
                    </div>
                    <div className="dp-row2">
                      <div className="dp-qr">
                        <svg
                          id="dpQr"
                          aria-hidden="true"
                          viewBox={qr.viewBox}
                          dangerouslySetInnerHTML={{ __html: qr.html }}
                        />
                        <span>SCAN TO VERIFY ON CHAIN</span>
                      </div>
                      <div className="dp-meta">
                        <div>
                          <span>AUTHORITY</span>
                          <b>CABINET OF THE REPUBLIC</b>
                        </div>
                        <div>
                          <span>GENESIS ADDRESS</span>
                          <b className="addr">1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa</b>
                        </div>
                        <div>
                          <span>SEALED</span>
                          <b>BLK 0 · GENESIS · 18:15:05 UTC</b>
                        </div>
                        <div className="dp-sig">
                          <span>SIGNATURE OF BEARER</span>
                          <svg width="120" height="26" viewBox="0 0 120 26" aria-hidden="true">
                            <path
                              d="M4 19 C 14 4, 22 6, 26 14 C 30 21, 36 20, 42 10 C 46 4, 50 8, 52 14 C 55 21, 62 18, 68 12 C 74 6, 80 8, 84 13 C 88 18, 96 16, 104 9 L 114 5"
                              fill="none"
                              stroke="#1f3252"
                              strokeWidth="1.3"
                              strokeLinecap="round"
                            />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="dp-mrz">
                    P&lt;CRYNAKAMOTO&lt;&lt;SATOSHI&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;
                    <br />
                    NS0000001CRY0901038X&lt;PERPETUAL&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;04
                  </div>
                </div>

                {/* cover (front + inside-cover back) */}
                <div className="pb-cover">
                  <div className="pb-face passport">
                    <div className="pp-inner">
                      <Crest tone="light" className="pp-seal" height={64} alt="" />
                      <div className="pp-title">CryptRepublic</div>
                      <div className="pp-sub">SOULBOUND PASSPORT · SPECIMEN</div>
                      <div className="pp-rows">
                        <div className="pp-row">
                          <span>CITIZEN №</span>
                          <b>00 001</b>
                        </div>
                        <div className="pp-row">
                          <span>VALIDITY</span>
                          <b style={{ color: "#c8a96a" }}>PERPETUAL</b>
                        </div>
                        <div className="pp-row">
                          <span>SEALED AT</span>
                          <b>GENESIS · BLK 0</b>
                        </div>
                      </div>
                      <div className="pp-mrz">
                        P&lt;CRYPT&lt;&lt;NAKAMOTO&lt;&lt;SATOSHI&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;
                      </div>
                    </div>
                  </div>
                  <div className="pb-face pb-back">
                    <div className="nft-head">
                      <Crest tone="light" height={30} alt="" />
                      <div>
                        <b>CryptRepublic</b>
                        <span>CITIZEN NFT · GENESIS EDITION</span>
                      </div>
                    </div>
                    <div className="nft-frame">
                      <svg
                        id="nftArt"
                        aria-hidden="true"
                        viewBox={nft.viewBox}
                        preserveAspectRatio={nft.preserveAspectRatio}
                        dangerouslySetInnerHTML={{ __html: nft.html }}
                      />
                      <i className="nft-holo"></i>
                    </div>
                    <div className="nft-meta">
                      <div>
                        <span>TOKEN</span>
                        <b>CR-PASSPORT #00001</b>
                      </div>
                      <div>
                        <span>EDITION</span>
                        <b>1 OF 1 · SOULBOUND</b>
                      </div>
                      <div>
                        <span>MINTED</span>
                        <b>GENESIS · BLK 0</b>
                      </div>
                    </div>
                    <span className="nft-oath">THE BEARER IS OBSERVED · ART. II §1</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="pp-hint">Hover / tap to inspect credential</div>
          </div>
        </div>
      </div>
    </section>
  );
}
