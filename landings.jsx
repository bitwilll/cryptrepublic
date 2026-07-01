// CryptRepublic — three landing directions for the canvas.
// Each is a self-contained, vertically-scrolling page rendered inside a DCArtboard.

const C = {
  forest: '#0c1a14',
  forestDeep: '#06100b',
  cream: '#e8e0cc',
  paper: '#f4f1ea',
  gold: '#c8a96a',
  goldDeep: '#9d8246',
  ink: '#0a0a0a',
  rule: '#1f1a14',
  white: '#ffffff',
};

// ─────────────────────────────────────────────────────────────────────────
// Shared pieces
// ─────────────────────────────────────────────────────────────────────────

function Seal({ size = 72, color = C.ink, bg = 'transparent' }) {
  // Octagonal civic seal with CR monogram. Drawn in SVG so it looks identical at any scale.
  const r = size / 2;
  const oct = Array.from({ length: 8 }, (_, i) => {
    const a = (Math.PI * 2 * i) / 8 - Math.PI / 8;
    return `${r + r * Math.cos(a)},${r + r * Math.sin(a)}`;
  }).join(' ');
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
      <polygon points={oct} fill={bg} stroke={color} strokeWidth={size * 0.04} />
      <polygon points={oct} fill="none" stroke={color} strokeWidth={size * 0.01} transform={`scale(0.82) translate(${size * 0.11},${size * 0.11})`} />
      <text x="50%" y="56%" textAnchor="middle" fontFamily="'Instrument Serif', serif" fontSize={size * 0.42} fill={color} fontWeight="400">CR</text>
      <text x="50%" y="78%" textAnchor="middle" fontFamily="'JetBrains Mono', monospace" fontSize={size * 0.08} fill={color} letterSpacing={size * 0.02}>MMXXVI</text>
    </svg>
  );
}

function Stamp({ children, color = C.ink, rotate = -4 }) {
  return (
    <div style={{
      display: 'inline-block',
      border: `2px solid ${color}`,
      color,
      padding: '4px 10px',
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      transform: `rotate(${rotate}deg)`,
    }}>{children}</div>
  );
}

function Ticker({ items, color = C.ink, bg = C.cream, sep = '✦' }) {
  // Marquee-style horizontal ticker.
  const dup = [...items, ...items, ...items];
  return (
    <div style={{ background: bg, color, borderTop: `1px solid ${color}`, borderBottom: `1px solid ${color}`, overflow: 'hidden', position: 'relative' }}>
      <div style={{
        display: 'flex', gap: 32, padding: '10px 0', whiteSpace: 'nowrap',
        animation: 'crmarquee 60s linear infinite',
        fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase',
      }}>
        {dup.map((t, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 32 }}>
            <span>{t}</span>
            <span style={{ opacity: 0.5 }}>{sep}</span>
          </span>
        ))}
      </div>
      <style>{`@keyframes crmarquee { from { transform: translateX(0) } to { transform: translateX(-33.3333%) } }`}</style>
    </div>
  );
}

// Animated population counter that drifts upward.
function PopulationCounter({ base = 48392, color = C.ink, size = 'lg' }) {
  const [n, setN] = React.useState(base);
  React.useEffect(() => {
    const id = setInterval(() => setN((v) => v + Math.floor(Math.random() * 3)), 1800);
    return () => clearInterval(id);
  }, []);
  const fs = size === 'lg' ? 96 : size === 'md' ? 56 : 28;
  return (
    <span style={{
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: fs,
      fontVariantNumeric: 'tabular-nums',
      letterSpacing: '-0.02em',
      color,
      fontWeight: 500,
    }}>{n.toLocaleString('en-US').replace(/,/g, ' ')}</span>
  );
}

// Minimal SVG globe with citizen pings.
function Globe({ size = 280, color = C.ink, accent = C.gold, bg = 'transparent' }) {
  const lats = [-60, -30, 0, 30, 60];
  const lngs = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150];
  const pings = [
    { x: 0.32, y: 0.42 }, { x: 0.58, y: 0.38 }, { x: 0.72, y: 0.52 },
    { x: 0.45, y: 0.62 }, { x: 0.22, y: 0.58 }, { x: 0.68, y: 0.30 },
    { x: 0.50, y: 0.50 }, { x: 0.40, y: 0.30 },
  ];
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: 'block', background: bg }}>
      <circle cx="50" cy="50" r="48" fill="none" stroke={color} strokeWidth="0.5" />
      {lats.map((l) => (
        <ellipse key={`la${l}`} cx="50" cy="50" rx="48" ry={48 * Math.cos((l * Math.PI) / 180)} fill="none" stroke={color} strokeWidth="0.3" opacity="0.45" />
      ))}
      {lngs.map((l) => (
        <ellipse key={`lo${l}`} cx="50" cy="50" rx={48 * Math.abs(Math.cos((l * Math.PI) / 180))} ry="48" fill="none" stroke={color} strokeWidth="0.3" opacity="0.45" />
      ))}
      <circle cx="50" cy="50" r="48" fill="none" stroke={color} strokeWidth="0.8" />
      {pings.map((p, i) => (
        <g key={i} style={{ animation: `crping 2.4s ease-out infinite`, animationDelay: `${i * 0.3}s`, transformOrigin: `${p.x * 100}px ${p.y * 100}px` }}>
          <circle cx={p.x * 100} cy={p.y * 100} r="1" fill={accent} />
          <circle cx={p.x * 100} cy={p.y * 100} r="3" fill="none" stroke={accent} strokeWidth="0.4" opacity="0.6" />
        </g>
      ))}
      <style>{`@keyframes crping { 0%{r:0.5;opacity:1} 100%{r:5;opacity:0} }`}</style>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// DIRECTION 01 — MANIFESTO  (cream paper, all mono, dense, founding-doc)
// ─────────────────────────────────────────────────────────────────────────

function LandingManifesto() {
  const root = {
    width: '100%',
    background: C.paper,
    color: C.ink,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 13,
    lineHeight: 1.5,
  };
  const rule = (w = 1) => ({ borderTop: `${w}px solid ${C.ink}` });
  const tag = { fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', opacity: 0.7 };
  const num = { fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums' };

  return (
    <div style={root}>
      {/* Nav */}
      <div style={{ ...rule(1), borderBottom: `1px solid ${C.ink}`, display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', padding: '14px 40px' }}>
        <div style={{ ...tag }}>EST. MMXXVI · NETWORK STATE №001</div>
        <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 22, letterSpacing: '0.04em' }}>CryptRepublic</div>
        <div style={{ ...tag, textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: 24 }}>
          <span>CONSTITUTION</span><span>TREASURY</span><span>EMBASSIES</span><span>LEDGER</span>
        </div>
      </div>

      {/* Hero */}
      <div style={{ padding: '80px 40px 60px', position: 'relative' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, alignItems: 'end' }}>
          <div>
            <div style={{ ...tag, marginBottom: 24 }}>ARTICLE I · PREAMBLE</div>
            <h1 style={{
              fontFamily: "'Instrument Serif', serif",
              fontSize: 124, lineHeight: 0.9, margin: 0, fontWeight: 400, letterSpacing: '-0.02em',
            }}>
              A nation<br />without a<br /><em style={{ color: C.goldDeep }}>territory.</em>
            </h1>
          </div>
          <div style={{ paddingBottom: 12 }}>
            <p style={{ fontSize: 15, lineHeight: 1.55, maxWidth: 420, margin: 0 }}>
              CryptRepublic is a sovereign collective of <u>48,392</u> citizens bound by cryptographic oath, not by soil.
              Citizenship is minted, not granted. The constitution is amendable but never abandonable.
              You are observed.
            </p>
            <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
              <a href="Dashboard.html" style={{
                background: C.ink, color: C.paper, padding: '16px 22px',
                fontSize: 12, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase',
                textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 10,
              }}>MINT PASSPORT <span style={{ opacity: 0.6 }}>↗</span></a>
              <button style={{
                background: 'transparent', color: C.ink, padding: '16px 22px',
                fontSize: 12, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase',
                border: `1px solid ${C.ink}`, cursor: 'pointer',
              }}>READ THE CONSTITUTION</button>
            </div>
            <div style={{ marginTop: 24, ...tag, display: 'flex', gap: 24 }}>
              <span>○ MINT FEE 0.04 ETH</span><span>○ NON-TRANSFERABLE</span><span>○ FOREVER</span>
            </div>
          </div>
        </div>

        {/* Floating seal */}
        <div style={{ position: 'absolute', top: 40, right: 40 }}>
          <Seal size={120} color={C.ink} />
        </div>
      </div>

      {/* Stats strip */}
      <div style={{ ...rule(2), borderBottom: `2px solid ${C.ink}`, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)' }}>
        {[
          ['CITIZENS', <PopulationCounter base={48392} size="md" key="p" />],
          ['TREASURY', <span key="t" style={{ ...num, fontSize: 56, fontWeight: 500, letterSpacing: '-0.02em' }}>$14.2M</span>],
          ['EMBASSIES', <span key="e" style={{ ...num, fontSize: 56, fontWeight: 500, letterSpacing: '-0.02em' }}>27</span>],
          ['AMENDMENTS', <span key="a" style={{ ...num, fontSize: 56, fontWeight: 500, letterSpacing: '-0.02em' }}>14</span>],
          ['EST.', <span key="y" style={{ ...num, fontSize: 56, fontWeight: 500, letterSpacing: '-0.02em' }}>2026</span>],
        ].map(([label, val], i, arr) => (
          <div key={label} style={{ padding: '32px 28px', borderRight: i < arr.length - 1 ? `1px solid ${C.ink}` : 'none' }}>
            <div style={{ ...tag, marginBottom: 12 }}>{label}</div>
            {val}
          </div>
        ))}
      </div>

      {/* Passport block */}
      <div style={{ ...rule(0), padding: '80px 40px', borderBottom: `1px solid ${C.ink}`, display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 56, alignItems: 'center' }}>
        <div>
          <div style={{ ...tag, marginBottom: 16 }}>ARTICLE II · CITIZENSHIP</div>
          <h2 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 64, lineHeight: 1, margin: 0, fontWeight: 400 }}>
            The passport is the person.
          </h2>
          <p style={{ marginTop: 24, fontSize: 14, lineHeight: 1.6, maxWidth: 520 }}>
            Each citizen mints a soulbound credential — a cryptographic ID that votes, holds, signs, and inherits.
            It cannot be sold. It cannot be transferred. It can only be retired upon the death of its holder.
            The passport is your only proof. The passport is your only protection.
          </p>
          <div style={{ marginTop: 32, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, border: `1px solid ${C.ink}` }}>
            {[
              ['01', 'SUBMIT OATH', 'Cryptographic signature attesting to the Constitution.'],
              ['02', 'PROOF OF LIFE', 'A biometric attestation or a notarized witness.'],
              ['03', 'CITIZEN STATUS', 'Voting rights activate within 72 hours.'],
            ].map(([n, t, d], i) => (
              <div key={n} style={{ padding: '20px 18px', borderRight: i < 2 ? `1px solid ${C.ink}` : 'none' }}>
                <div style={{ fontSize: 32, fontFamily: "'Instrument Serif', serif" }}>{n}</div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', marginTop: 8 }}>{t}</div>
                <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6, lineHeight: 1.5 }}>{d}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Passport mock */}
        <div style={{ background: C.ink, color: C.paper, padding: 32, position: 'relative', aspectRatio: '85/120', maxWidth: 420, justifySelf: 'end' }}>
          <div style={{ position: 'absolute', top: 24, right: 24 }}><Seal size={56} color={C.gold} /></div>
          <div style={{ ...tag, color: C.gold, opacity: 1 }}>PASSPORT · CRYPTREPUBLIC</div>
          <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 28, lineHeight: 1.05, marginTop: 14 }}>
            Network State of<br />CryptRepublic
          </div>
          <div style={{ marginTop: 'auto', position: 'absolute', bottom: 32, left: 32, right: 32 }}>
            <div style={{ borderTop: `1px solid ${C.gold}`, paddingTop: 14, ...num }}>
              <div style={{ fontSize: 10, letterSpacing: '0.18em', color: C.gold }}>BEARER</div>
              <div style={{ fontSize: 22, marginTop: 4 }}>CITIZEN №04392</div>
              <div style={{ fontSize: 10, letterSpacing: '0.18em', color: C.gold, marginTop: 18 }}>ISSUED · EXPIRES</div>
              <div style={{ fontSize: 14, marginTop: 4 }}>2026.04.11 — NEVER</div>
              <div style={{
                marginTop: 18, fontSize: 9, opacity: 0.7,
                letterSpacing: '0.06em',
                wordBreak: 'break-all',
              }}>
                0x9f3a · b21c · 4d8e · 7c19 · cafe · beef
              </div>
            </div>
          </div>
        </div>
      </div>

      <Ticker bg={C.gold} color={C.ink} items={[
        'CITIZEN 38291 ADMITTED', 'AMENDMENT XIV PASSED 71%', 'EMBASSY LISBON OPENED',
        'TREASURY +0.42%', 'CITIZEN 38292 ADMITTED', 'OATH SIGNING — TOKYO 06.04',
      ]} />

      {/* Articles index */}
      <div style={{ padding: '80px 40px', borderBottom: `1px solid ${C.ink}` }}>
        <div style={{ ...tag, marginBottom: 24 }}>INDEX · ARTICLES OF THE REPUBLIC</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, border: `1px solid ${C.ink}` }}>
          {[
            ['I', 'On the Preamble', 'Why a nation without territory.'],
            ['II', 'On Citizenship', 'The passport is the person.'],
            ['III', 'On Governance', 'Every citizen, every vote, on-chain.'],
            ['IV', 'On the Treasury', '$CRYPT as the unit of common faith.'],
            ['V', 'On Embassies', 'The republic in physical form.'],
            ['VI', 'On Services', 'Identity, health, finance — provided.'],
            ['VII', 'On Recognition', 'The roadmap to sovereignty.'],
            ['VIII', 'On Dissent', 'The right to fork, the duty to return.'],
          ].map(([n, t, d], i) => (
            <a key={n} href="#" style={{
              padding: '24px 28px', textDecoration: 'none', color: C.ink, display: 'grid',
              gridTemplateColumns: '64px 1fr auto', alignItems: 'baseline', gap: 16,
              borderRight: i % 2 === 0 ? `1px solid ${C.ink}` : 'none',
              borderTop: i > 1 ? `1px solid ${C.ink}` : 'none',
            }}>
              <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 36 }}>{n}</div>
              <div>
                <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 22, fontStyle: 'italic' }}>{t}</div>
                <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{d}</div>
              </div>
              <div style={{ fontSize: 11, letterSpacing: '0.18em' }}>READ →</div>
            </a>
          ))}
        </div>
      </div>

      {/* Founders */}
      <div style={{ padding: '80px 40px', borderBottom: `1px solid ${C.ink}`, display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 56 }}>
        <div>
          <div style={{ ...tag, marginBottom: 16 }}>CABINET · FOUNDERS</div>
          <h2 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 56, lineHeight: 1, margin: 0, fontWeight: 400 }}>
            Eight signatories.<br />One <em>oath</em>.
          </h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24 }}>
          {[
            ['A. NAKADAI', 'Treasury'],
            ['M. CORREIA', 'Constitution'],
            ['R. ÅSLUND', 'Embassies'],
            ['I. CHEN', 'Identity'],
            ['V. ROZAS', 'Services'],
            ['S. OKONKWO', 'Defense'],
            ['L. PARMAR', 'Records'],
            ['Y. KAZIMI', 'Foreign'],
          ].map(([name, dept]) => (
            <div key={name}>
              <div style={{
                aspectRatio: '4/5', background: C.ink, marginBottom: 10, position: 'relative', overflow: 'hidden',
              }}>
                <div style={{
                  position: 'absolute', inset: 0,
                  background: `radial-gradient(ellipse at 50% 30%, ${C.cream} 0%, ${C.cream} 30%, transparent 31%)`,
                  opacity: 0.18,
                }} />
                <div style={{ position: 'absolute', bottom: 8, left: 8, color: C.gold, fontSize: 9, letterSpacing: '0.18em' }}>№ {String(Math.floor(Math.random()*900)+100)}</div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}>{name}</div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>MIN. of {dept}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Roadmap */}
      <div style={{ padding: '80px 40px', borderBottom: `1px solid ${C.ink}` }}>
        <div style={{ ...tag, marginBottom: 24 }}>ARTICLE VII · ROADMAP TO RECOGNITION</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', border: `1px solid ${C.ink}` }}>
          {[
            ['2026', 'Constitution ratified. First 50k citizens.', true],
            ['2027', 'First 10 embassies. National treasury 7-figures.', true],
            ['2028', 'Diplomatic recognition by 1 sovereign state.', false],
            ['2030', 'Territory leased. Health & banking online.', false],
            ['2035', 'Full UN member-state proposal submitted.', false],
          ].map(([y, t, done], i, arr) => (
            <div key={y} style={{
              padding: '24px 22px',
              borderRight: i < arr.length - 1 ? `1px solid ${C.ink}` : 'none',
              background: done ? C.gold : 'transparent',
            }}>
              <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 44 }}>{y}</div>
              <div style={{ fontSize: 12, opacity: 0.8, marginTop: 8 }}>{t}</div>
              <div style={{ marginTop: 12, fontSize: 10, letterSpacing: '0.18em' }}>{done ? '◉ COMPLETE' : '○ PENDING'}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Closing oath */}
      <div style={{ padding: '120px 40px 60px', textAlign: 'center', background: C.ink, color: C.paper, position: 'relative' }}>
        <Stamp color={C.gold} rotate={-3}>OATH OF ENTRY</Stamp>
        <h2 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 88, lineHeight: 1, margin: '32px 0 0', fontWeight: 400, fontStyle: 'italic' }}>
          "I am observed.<br />I am bound.<br />I am the Republic."
        </h2>
        <div style={{ marginTop: 48 }}>
          <a href="Dashboard.html" style={{
            background: C.gold, color: C.ink, padding: '20px 28px',
            fontSize: 12, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase',
            textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 10,
          }}>SWEAR THE OATH · MINT PASSPORT ↗</a>
        </div>
        <div style={{ marginTop: 80, ...tag, color: C.gold, opacity: 1, display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${C.goldDeep}`, paddingTop: 24 }}>
          <span>CRYPTREPUBLIC · MMXXVI</span>
          <span>BLOCK 21 408 932</span>
          <span>YOU HAVE BEEN OBSERVED</span>
        </div>
      </div>
    </div>
  );
}

window.LandingManifesto = LandingManifesto;
window.Seal = Seal;
window.Stamp = Stamp;
window.Ticker = Ticker;
window.PopulationCounter = PopulationCounter;
window.Globe = Globe;
window.CR_C = C;
