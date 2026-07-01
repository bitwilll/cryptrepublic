// dash-holdings.jsx — Sovereign Holdings + Wallet/Chain screens
// Every asset owned by CryptRepublic generates dividends paid pro-rata to every citizen's wallet.

const { useState: useSH, useEffect: useEH, useMemo: useMH } = React;

// ─── SOVEREIGN HOLDINGS ────────────────────────────────────────────────
function HoldingsScreen() {
  const t = useTokens();
  const [claimed, setClaimed] = useSH(false);
  const [tab, setTab] = useSH('all');

  // The full ledger of state-owned assets
  const ASSETS = useMH(() => [
    // Real estate (the embassies + holdings)
    { id: 'RE-001', kind: 're',  name: 'Embassy Lisbon — Avenida da Liberdade',  loc: 'Lisbon, PT',     val: 28400000, yld: 4.8, ann: 1363200, status: 'OWNED · TITLED ON CHAIN',  acq: '2024.11.04' },
    { id: 'RE-002', kind: 're',  name: 'Embassy Tokyo — Shimokitazawa block',     loc: 'Tokyo, JP',      val: 41200000, yld: 3.6, ann: 1483200, status: 'OWNED · TITLED ON CHAIN',  acq: '2025.01.22' },
    { id: 'RE-003', kind: 're',  name: 'Embassy New York — East Village',         loc: 'New York, US',   val: 38900000, yld: 4.1, ann: 1594900, status: 'OWNED · TITLED ON CHAIN',  acq: '2025.02.14' },
    { id: 'RE-004', kind: 're',  name: 'Embassy Tallinn — Telliskivi',             loc: 'Tallinn, EE',    val: 9200000,  yld: 5.4, ann: 496800,  status: 'OWNED · TITLED ON CHAIN',  acq: '2024.09.18' },
    { id: 'RE-005', kind: 're',  name: 'Embassy Berlin — Mitte / Torstraße',       loc: 'Berlin, DE',     val: 22800000, yld: 4.3, ann: 980400,  status: 'OWNED · TITLED ON CHAIN',  acq: '2024.12.02' },
    { id: 'RE-006', kind: 're',  name: 'Citizens\' Farmland — Alentejo (3 800 ha)',loc: 'Alentejo, PT',   val: 14600000, yld: 5.8, ann: 846800,  status: 'OWNED · TITLED ON CHAIN',  acq: '2025.03.30' },
    { id: 'RE-007', kind: 're',  name: 'Solar Estate — Atacama (820 acres)',      loc: 'Atacama, CL',    val: 18400000, yld: 7.2, ann: 1324800, status: 'OWNED · TITLED ON CHAIN',  acq: '2025.07.18' },

    // Patents & IP
    { id: 'IP-001', kind: 'ip',  name: 'US 11,492,818 — Soulbound credential issuance', loc: 'USPTO · 17 jurisdictions', val: 18600000, yld: 9.4, ann: 1748400, status: 'GRANTED · LICENSED',     acq: '2025.04.11' },
    { id: 'IP-002', kind: 'ip',  name: 'EP 4 028 191 — Pseudonymous voting with proof', loc: 'EPO · 26 jurisdictions',   val: 14200000, yld: 8.1, ann: 1150200, status: 'GRANTED · LICENSED',     acq: '2025.06.04' },
    { id: 'IP-003', kind: 'ip',  name: 'JP 7 102 488 — Embassy interop protocol',       loc: 'JPO',                      val: 6800000,  yld: 6.6, ann: 448800,  status: 'GRANTED',                acq: '2025.09.22' },
    { id: 'IP-004', kind: 'ip',  name: 'PCT/CR2026/00041 — On-chain census',            loc: 'WIPO · pending',           val: 11400000, yld: 0.0, ann: 0,       status: 'PENDING · 31m FILED',    acq: '2026.02.04' },

    // Equity / chain
    { id: 'EQ-001', kind: 'eq',  name: 'Validator Pool §14 — CryptRepublic L2',  loc: 'Chain · CR-L2',     val: 92400000, yld: 11.8, ann: 10903200, status: 'STAKED · 16% NETWORK',  acq: '2024.10.01' },
    { id: 'EQ-002', kind: 'eq',  name: 'Stake — Republic Bridge Inc.',           loc: 'Cayman · Class A',  val: 36800000, yld: 7.4,  ann: 2723200,  status: 'OWNED · 18% EQUITY',     acq: '2025.05.12' },
    { id: 'EQ-003', kind: 'eq',  name: 'Stake — Translation Council OpCo',       loc: 'Estonia · OÜ',      val: 4200000,  yld: 2.1,  ann: 88200,    status: 'OWNED · 100% EQUITY',    acq: '2025.08.04' },

    // Treasury reserves
    { id: 'TR-001', kind: 'tr',  name: 'Stablecoin reserve (USDC, EURC, USDT)',  loc: 'Multisig 4-of-7',   val: 68400000, yld: 4.6,  ann: 3146400,  status: 'LIQUID',                 acq: 'ongoing' },
    { id: 'TR-002', kind: 'tr',  name: 'Bitcoin reserve',                        loc: 'Cold · 0xbtc…',     val: 16200000, yld: 0.0,  ann: 0,        status: 'LIQUID · NON-YIELDING',  acq: 'ongoing' },
    { id: 'TR-003', kind: 'tr',  name: 'Ethereum reserve (incl. staked ETH)',    loc: 'Cold · 0xeth…',     val: 14800000, yld: 3.2,  ann: 473600,   status: 'STAKED 64%',             acq: 'ongoing' },
  ], []);

  const total = ASSETS.reduce((s, a) => s + a.val, 0);
  const annualYield = ASSETS.reduce((s, a) => s + a.ann, 0);
  const citizenN = 48392;
  const perCitizenAnnual = annualYield / citizenN;
  const nextDividendPerCitizen = perCitizenAnnual / 4; // quarterly
  const myShare = nextDividendPerCitizen; // 1 vote = 1 share, equal split

  const KINDS = [
    { k: 'all', l: 'All', color: t.fg },
    { k: 're',  l: 'Real estate', color: t.gold },
    { k: 'ip',  l: 'Patents & IP', color: t.success },
    { k: 'eq',  l: 'Equity stakes', color: '#a8c0e4' },
    { k: 'tr',  l: 'Crypto reserves', color: '#7cffa6' },
  ];

  const filtered = tab === 'all' ? ASSETS : ASSETS.filter(a => a.kind === tab);
  const kindTotals = ['re', 'ip', 'eq', 'tr'].map(k => ({
    k, sum: ASSETS.filter(a => a.kind === k).reduce((s, a) => s + a.val, 0),
  }));

  const fmt$ = (n) => '$' + (n / 1e6 >= 1
    ? (n / 1e6).toFixed(n >= 1e9 ? 0 : 2) + 'M'
    : Math.round(n).toLocaleString('en-US').replace(/,/g, ' '));

  return (
    <div style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Hero — total AUM + your dividend */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', minHeight: 280 }}>
          <div style={{ padding: '32px 36px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <Tag fg={t.gold} border={t.gold}>SOVEREIGN HOLDINGS · 48 392 CITIZENS · EQUAL SHARES</Tag>
            <div style={{ marginTop: 14, fontSize: 11, color: t.muted, letterSpacing: '0.12em', fontWeight: 700 }}>TOTAL ASSETS UNDER REPUBLIC · BLOCK 21 408 932</div>
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 18, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 84, fontWeight: 800, color: t.fg, letterSpacing: '-0.04em', lineHeight: 1, fontFamily: "'Manrope'" }}>${(total / 1e6).toFixed(1)}M</span>
              <span style={{ fontSize: 16, color: t.success, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>+12.4% YoY</span>
            </div>
            <p style={{ marginTop: 12, fontSize: 15, color: t.muted, lineHeight: 1.55, maxWidth: 560, fontFamily: "'Newsreader', serif", fontStyle: 'italic' }}>
              Every asset owned by the Republic is owned, in equal share, by every citizen. There are no shareholders. There is only the citizenry.
            </p>
          </div>

          <div style={{ padding: '32px 36px', background: t.passportBg, color: t.passportFg, display: 'flex', flexDirection: 'column', justifyContent: 'center', borderLeft: `1px solid ${t.rule}` }}>
            <div style={{ fontSize: 11, color: t.accentGold, letterSpacing: '0.12em', fontWeight: 700 }}>YOUR Q2 DIVIDEND · CLAIMABLE</div>
            <div style={{ marginTop: 8, fontSize: 56, fontWeight: 800, color: t.accentGold, letterSpacing: '-0.03em', lineHeight: 1 }}>${myShare.toFixed(2)}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', fontFamily: "'JetBrains Mono', monospace", marginTop: 4, letterSpacing: '0.04em' }}>{(myShare * 100 / 100).toFixed(2)} $CRYPT · 1/48 392 of ${annualYield.toLocaleString('en-US').replace(/,/g, ' ')}/yr</div>

            <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
              <div><div style={{ color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em' }}>NEXT BLOCK</div><div style={{ color: t.accentGold, fontWeight: 700, marginTop: 2 }}>21 408 940</div></div>
              <div><div style={{ color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em' }}>VEST DATE</div><div style={{ color: t.accentGold, fontWeight: 700, marginTop: 2 }}>2026.06.30</div></div>
            </div>

            <button onClick={() => setClaimed(true)} disabled={claimed} style={{
              marginTop: 20, padding: '14px 18px', borderRadius: 999, border: 'none',
              background: claimed ? 'rgba(124,255,166,0.18)' : t.accentGold,
              color: claimed ? '#7cffa6' : t.passportBg, cursor: claimed ? 'default' : 'pointer',
              fontFamily: 'inherit', fontWeight: 700, fontSize: 13, letterSpacing: '0.06em',
            }}>{claimed ? `✓ CLAIMED TO 0x7a3f…d402` : 'CLAIM DIVIDEND →'}</button>
          </div>
        </div>
      </Card>

      {/* Composition row — bar + per-kind tiles */}
      <Card style={{ padding: '24px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ fontFamily: "'Newsreader', serif", fontStyle: 'italic', fontSize: 22, fontWeight: 500 }}>Composition of the estate</div>
          <Tag>RATIFIED · BLOCK 21 408 871</Tag>
        </div>
        <div style={{ marginTop: 18, height: 16, display: 'flex', borderRadius: 999, overflow: 'hidden', border: `1px solid ${t.rule}` }}>
          {kindTotals.map(({ k, sum }) => {
            const c = KINDS.find(x => x.k === k).color;
            return <div key={k} style={{ width: `${(sum / total) * 100}%`, background: c }} title={k} />;
          })}
        </div>
        <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {kindTotals.map(({ k, sum }) => {
            const meta = KINDS.find(x => x.k === k);
            return (
              <div key={k} style={{ padding: '14px 16px', background: t.bg, border: `1px solid ${t.rule}`, borderLeft: `3px solid ${meta.color}` }}>
                <div style={{ fontSize: 10, color: t.muted, letterSpacing: '0.08em', fontWeight: 700 }}>{meta.l.toUpperCase()}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: t.fg, marginTop: 4, letterSpacing: '-0.02em' }}>{fmt$(sum)}</div>
                <div style={{ fontSize: 11, color: t.muted, fontFamily: "'JetBrains Mono', monospace" }}>{((sum / total) * 100).toFixed(1)}%</div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Filter + asset ledger */}
      <Card style={{ padding: 0 }}>
        <div style={{ padding: '18px 22px', borderBottom: `1px solid ${t.rule}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontFamily: "'Newsreader', serif", fontStyle: 'italic', fontSize: 22, fontWeight: 500 }}>The asset register</div>
            <div style={{ fontSize: 12, color: t.muted, marginTop: 4 }}>Every property, patent and stake — titled on chain · ${(annualYield / 1e6).toFixed(2)}M annual yield paid to citizens</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {KINDS.map((kn) => (
              <button key={kn.k} onClick={() => setTab(kn.k)} style={{
                padding: '7px 14px', borderRadius: 999, cursor: 'pointer',
                background: tab === kn.k ? t.fg : 'transparent',
                color: tab === kn.k ? t.bg : t.fg,
                border: `1px solid ${tab === kn.k ? t.fg : t.rule}`,
                fontFamily: 'inherit', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
              }}>{kn.l.toUpperCase()}</button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '70px 70px 1fr 160px 120px 90px 130px', padding: '10px 22px', fontSize: 10, color: t.muted, letterSpacing: '0.12em', fontWeight: 700, borderBottom: `1px solid ${t.rule}` }}>
          <span>KIND</span><span>ID</span><span>ASSET</span><span>LOCATION / HOLDER</span><span style={{ textAlign: 'right' }}>VALUE</span><span style={{ textAlign: 'right' }}>YIELD</span><span style={{ textAlign: 'right' }}>STATUS</span>
        </div>

        {filtered.map((a, i) => {
          const meta = KINDS.find(k => k.k === a.kind);
          return (
            <div key={a.id} style={{
              display: 'grid', gridTemplateColumns: '70px 70px 1fr 160px 120px 90px 130px',
              padding: '14px 22px', borderBottom: i === filtered.length - 1 ? 'none' : `1px solid ${t.rule}`,
              fontSize: 13, alignItems: 'center',
            }}>
              <span><Tag fg={meta.color} border={meta.color}>{meta.l.split(' ')[0].toUpperCase()}</Tag></span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: t.muted }}>{a.id}</span>
              <span style={{ color: t.fg, fontWeight: 600, paddingRight: 12 }}>{a.name}</span>
              <span style={{ color: t.muted, fontSize: 12 }}>{a.loc}</span>
              <span style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", color: t.fg, fontWeight: 700 }}>{fmt$(a.val)}</span>
              <span style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", color: a.yld > 0 ? t.success : t.muted, fontWeight: 700 }}>{a.yld.toFixed(1)}%</span>
              <span style={{ textAlign: 'right', fontSize: 10, color: t.muted, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.06em' }}>{a.status}</span>
            </div>
          );
        })}
      </Card>

      {/* Dividend history */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20 }}>
        <Card style={{ padding: 0 }}>
          <div style={{ padding: '18px 22px', borderBottom: `1px solid ${t.rule}` }}>
            <div style={{ fontFamily: "'Newsreader', serif", fontStyle: 'italic', fontSize: 22, fontWeight: 500 }}>Your dividend history</div>
            <div style={{ fontSize: 12, color: t.muted, marginTop: 4 }}>Paid quarterly, in $CRYPT, to your wallet 0x7a3f…d402</div>
          </div>
          {[
            ['Q1 2026', 'BLK 20 901 422', '$112.40', '112.40 $CRYPT', 'PAID', t.success],
            ['Q4 2025', 'BLK 19 884 011', '$108.10', '108.10 $CRYPT', 'PAID', t.success],
            ['Q3 2025', 'BLK 18 902 488', '$94.30',  '94.30 $CRYPT',  'PAID', t.success],
            ['Q2 2025', 'BLK 17 880 991', '$88.20',  '88.20 $CRYPT',  'PAID', t.success],
            ['Q1 2025', 'BLK 16 887 002', '$71.80',  '71.80 $CRYPT',  'PAID', t.success],
          ].map((row, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '90px 140px 90px 130px 100px', padding: '12px 22px', borderTop: `1px solid ${t.rule}`, fontSize: 13, alignItems: 'center' }}>
              <span style={{ color: t.fg, fontWeight: 700 }}>{row[0]}</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: t.muted }}>{row[1]}</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", color: t.gold, fontWeight: 700 }}>{row[2]}</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: t.muted }}>{row[3]}</span>
              <span style={{ textAlign: 'right' }}><Tag fg={row[5]} border={row[5]}>{row[4]}</Tag></span>
            </div>
          ))}
        </Card>

        <Card style={{ padding: '24px 28px' }}>
          <div style={{ fontFamily: "'Newsreader', serif", fontStyle: 'italic', fontSize: 22, fontWeight: 500 }}>The doctrine</div>
          <p style={{ fontSize: 14, color: t.fg, marginTop: 14, lineHeight: 1.6, fontFamily: "'Newsreader', serif" }}>
            <i>"Every parcel of land. Every patent granted. Every equity stake taken. Every coin reserved. All of it is owned, in equal share, by every citizen of the Republic. The dividends are paid pro-rata, every quarter, on chain, without exception."</i>
          </p>
          <div style={{ marginTop: 16, fontSize: 12, color: t.muted, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.04em' }}>— CONSTITUTION ART. IV §1 · RATIFIED MMXXVI</div>

          <div style={{ marginTop: 22, paddingTop: 18, borderTop: `1px solid ${t.rule}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              ['Total assets', fmt$(total)],
              ['Annual yield', fmt$(annualYield)],
              ['Citizens (shareholders)', '48 392'],
              ['Per-citizen annual', '$' + perCitizenAnnual.toFixed(2)],
              ['Per-citizen quarterly', '$' + nextDividendPerCitizen.toFixed(2)],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: t.muted }}>{k}</span>
                <span style={{ color: t.fg, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{v}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
window.HoldingsScreen = HoldingsScreen;

// ─── WALLET & CHAIN ────────────────────────────────────────────────────
function WalletScreen({ citizenNo }) {
  const t = useTokens();
  const [copied, setCopied] = useSH(false);
  const addr = '0x7a3f9e1a8c4d52b9f10ad4c8e8e1f0b39cd7d402';

  return (
    <div style={{ padding: 32, display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Wallet hero */}
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ background: t.passportBg, color: t.passportFg, padding: '28px 32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: t.accentGold, letterSpacing: '0.12em', fontWeight: 700 }}>CITIZEN WALLET · CR-L2 · CHAIN ID 7331</div>
                <div style={{ marginTop: 4, fontSize: 14, color: 'rgba(255,255,255,0.65)', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {addr.slice(0, 22) + '…' + addr.slice(-10)}
                  <button onClick={() => { navigator.clipboard && navigator.clipboard.writeText(addr); setCopied(true); setTimeout(() => setCopied(false), 1200); }} style={{
                    background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: t.accentGold,
                    padding: '3px 8px', borderRadius: 999, fontSize: 10, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.06em', fontWeight: 700,
                  }}>{copied ? 'COPIED ✓' : 'COPY'}</button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: t.accentGold }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#7cffa6', boxShadow: '0 0 8px #7cffa6' }} />
                <span style={{ letterSpacing: '0.08em' }}>SYNCED · BLOCK 21 408 932</span>
              </div>
            </div>
            <div style={{ marginTop: 26, display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 68, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1, fontFamily: "'Manrope'" }}>$2 480.00</span>
              <span style={{ fontSize: 18, color: t.accentGold, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>2 480 $CRYPT</span>
              <span style={{ fontSize: 14, color: '#7cffa6', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>+1.8% / 24h</span>
            </div>
            <div style={{ marginTop: 20, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {['SEND', 'RECEIVE', 'SWAP', 'STAKE', 'BRIDGE TO L1'].map((a) => (
                <button key={a} style={{
                  padding: '11px 18px', borderRadius: 999, cursor: 'pointer',
                  background: a === 'SEND' ? t.accentGold : 'rgba(255,255,255,0.08)',
                  color: a === 'SEND' ? t.passportBg : '#fff',
                  border: a === 'SEND' ? 'none' : '1px solid rgba(255,255,255,0.18)',
                  fontFamily: 'inherit', fontWeight: 700, fontSize: 12, letterSpacing: '0.06em',
                }}>{a}</button>
              ))}
            </div>
          </div>
        </Card>

        {/* Tokens & holdings */}
        <Card style={{ padding: 0 }}>
          <div style={{ padding: '18px 22px', borderBottom: `1px solid ${t.rule}` }}>
            <div style={{ fontFamily: "'Newsreader', serif", fontStyle: 'italic', fontSize: 22, fontWeight: 500 }}>Your tokens</div>
            <div style={{ fontSize: 12, color: t.muted, marginTop: 4 }}>Native + bridged · CryptRepublic L2</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '52px 1fr 110px 100px 110px', padding: '10px 22px', fontSize: 10, color: t.muted, letterSpacing: '0.12em', fontWeight: 700, borderBottom: `1px solid ${t.rule}` }}>
            <span></span><span>TOKEN</span><span style={{ textAlign: 'right' }}>BALANCE</span><span style={{ textAlign: 'right' }}>PRICE</span><span style={{ textAlign: 'right' }}>VALUE</span>
          </div>
          {[
            { sym: '₡', name: '$CRYPT · CryptRepublic native', bal: '2 480.00', price: '$1.00', value: '$2 480.00', col: t.gold },
            { sym: 'Ξ', name: 'Ethereum (bridged · WETH)',     bal: '0.412',    price: '$3 240.00', value: '$1 334.88', col: '#a8c0e4' },
            { sym: '₿', name: 'Bitcoin (bridged · WBTC)',      bal: '0.01840',  price: '$64 880.00', value: '$1 193.79', col: '#ffd4a8' },
            { sym: '$', name: 'USDC (bridged)',                bal: '482.10',   price: '$1.00', value: '$482.10', col: '#7cffa6' },
            { sym: '∞', name: 'CR-PASSPORT · soulbound NFT',   bal: '1',        price: 'n/a',  value: 'PRICELESS', col: t.accentGold },
          ].map((tk, i) => (
            <div key={tk.name} style={{ display: 'grid', gridTemplateColumns: '52px 1fr 110px 100px 110px', padding: '14px 22px', borderTop: `1px solid ${t.rule}`, alignItems: 'center', fontSize: 13 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: tk.col, color: t.passportBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Newsreader', serif", fontSize: 18, fontWeight: 700 }}>{tk.sym}</div>
              <span style={{ color: t.fg, fontWeight: 600 }}>{tk.name}</span>
              <span style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", color: t.fg }}>{tk.bal}</span>
              <span style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", color: t.muted }}>{tk.price}</span>
              <span style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", color: t.fg, fontWeight: 700 }}>{tk.value}</span>
            </div>
          ))}
        </Card>

        {/* On-chain activity */}
        <Card style={{ padding: 0 }}>
          <div style={{ padding: '18px 22px', borderBottom: `1px solid ${t.rule}`, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div>
              <div style={{ fontFamily: "'Newsreader', serif", fontStyle: 'italic', fontSize: 22, fontWeight: 500 }}>On-chain activity</div>
              <div style={{ fontSize: 12, color: t.muted, marginTop: 4 }}>Last 30 days · CR-L2 explorer</div>
            </div>
            <a href="#" style={{ fontSize: 12, color: t.gold, fontWeight: 700, textDecoration: 'none', letterSpacing: '0.04em' }}>VIEW ON EXPLORER ↗</a>
          </div>
          {[
            ['21 408 932', '14:22', 'RECEIVE',  'Q2 dividend payout',                  '+ 112.40 $CRYPT', t.success],
            ['21 408 712', '13:48', 'STAKE',    'Validator Pool §14',                  '− 124.00 $CRYPT', t.gold],
            ['21 408 422', '12:14', 'VOTE',     'Cast YEA on §47 (gas reimbursed)',    '0.00 $CRYPT',     t.muted],
            ['21 407 220', '11:02', 'SEND',     'Embassy Lisbon · monthly stipend',    '− 40.00 $CRYPT',  t.gold],
            ['21 406 902', '09:18', 'RECEIVE',  'Validator reward · slot 14',          '+ 8.20 $CRYPT',   t.success],
            ['21 406 011', '04:08', 'BRIDGE',   'WETH → CR-L2 (Republic Bridge)',      '+ 0.20 WETH',     t.success],
          ].map((row, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '120px 60px 100px 1fr 160px', padding: '12px 22px', borderTop: `1px solid ${t.rule}`, alignItems: 'center', fontSize: 13 }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: t.muted }}>{row[0]}</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: t.muted }}>{row[1]}</span>
              <Tag fg={row[5]} border={row[5]}>{row[2]}</Tag>
              <span style={{ color: t.fg, fontWeight: 500 }}>{row[3]}</span>
              <span style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", color: row[5], fontWeight: 700 }}>{row[4]}</span>
            </div>
          ))}
        </Card>
      </div>

      {/* RIGHT: chain stats + token */}
      <aside style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card style={{ padding: 22, background: t.passportBg, color: t.passportFg }}>
          <div style={{ fontSize: 10, color: t.accentGold, letterSpacing: '0.12em', fontWeight: 700 }}>$CRYPT · UTILITY TOKEN</div>
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em', fontFamily: "'Manrope'" }}>$1.0042</span>
            <span style={{ fontSize: 12, color: '#7cffa6', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>+0.42%</span>
          </div>
          <Spark color={t.accentGold} bg="rgba(200,169,106,0.16)" />
          <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
            {[
              ['SUPPLY', '480M'],
              ['CIRC.', '142M'],
              ['HOLDERS', '48 392'],
              ['MKT CAP', '$142.6M'],
            ].map(([k, v]) => (
              <div key={k}>
                <div style={{ color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em' }}>{k}</div>
                <div style={{ color: t.accentGold, fontWeight: 700, marginTop: 2 }}>{v}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card style={{ padding: 22 }}>
          <div style={{ fontSize: 10, color: t.muted, letterSpacing: '0.12em', fontWeight: 700 }}>CR-L2 · NETWORK STATUS</div>
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
            {[
              ['Block height', <LiveNumber base={21408932} step={2} interval={1200} />],
              ['Block time',   '~ 8.0 s'],
              ['TPS · 24h avg', '4 821'],
              ['Validators',   '128 active'],
              ['Gas (avg)',    '0.00021 $CRYPT'],
              ['Finality',     'instant · BFT'],
              ['Bridges',      'ETH · BTC · SOL · ARB'],
              ['Uptime · 30d', '100.00%'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: `1px solid ${t.rule}` }}>
                <span style={{ color: t.muted }}>{k}</span>
                <span style={{ color: t.fg, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{v}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card style={{ padding: 22 }}>
          <div style={{ fontSize: 10, color: t.muted, letterSpacing: '0.12em', fontWeight: 700 }}>YOUR VALIDATOR STAKE</div>
          <div style={{ marginTop: 10, fontSize: 28, fontWeight: 800, color: t.gold, letterSpacing: '-0.02em', fontFamily: "'Manrope'" }}>124 $CRYPT</div>
          <div style={{ fontSize: 11, color: t.muted, fontFamily: "'JetBrains Mono', monospace" }}>POOL §14 · 11.8% APR · 8.20 EARNED</div>
          <button style={{ marginTop: 12, width: '100%', padding: '10px 12px', borderRadius: 6, background: 'transparent', border: `1px solid ${t.rule}`, color: t.fg, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 11, letterSpacing: '0.06em' }}>MANAGE STAKE →</button>
        </Card>
      </aside>
    </div>
  );
}
window.WalletScreen = WalletScreen;

function Spark({ color = '#c8a96a', bg = 'transparent' }) {
  const pts = useMH(() => {
    const ys = [];
    let v = 50;
    for (let i = 0; i < 40; i++) {
      v += (Math.sin(i / 3.1) * 5) + (Math.random() - 0.5) * 4;
      ys.push(v);
    }
    return ys;
  }, []);
  const W = 280, H = 50;
  const min = Math.min(...pts), max = Math.max(...pts);
  const x = (i) => (i / (pts.length - 1)) * W;
  const y = (v) => H - 4 - ((v - min) / (max - min)) * (H - 8);
  const path = pts.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = `${path} L ${W} ${H} L 0 ${H} Z`;
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ marginTop: 10, display: 'block' }}>
      <path d={area} fill={bg} />
      <path d={path} fill="none" stroke={color} strokeWidth="1.4" />
    </svg>
  );
}
