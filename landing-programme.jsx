// CryptRepublic — Direction 00: PROGRAMME (e-Residency aligned)
// Government-issued programme aesthetic: deep navy, royal blue, photographic hero,
// three pillars, three-step process, stat blocks, testimonials, newsletter.

const PRG = {
  bg: '#ffffff',
  panel: '#f4f6f8',
  ink: '#0a1929',
  navy: '#0a2540',
  blue: '#1957d3',
  blueDeep: '#0e3a9b',
  cyan: '#00b3e6',
  border: '#e5eaef',
  muted: '#5a6a7d',
  gold: '#c8a96a',
  passportNavy: '#0a2540',
};

function PrgSeal({ size = 56, color = '#fff', bg = 'transparent' }) {
  const r = size / 2;
  const oct = Array.from({ length: 8 }, (_, i) => {
    const a = (Math.PI * 2 * i) / 8 - Math.PI / 8;
    return `${r + r * Math.cos(a)},${r + r * Math.sin(a)}`;
  }).join(' ');
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
      <polygon points={oct} fill={bg} stroke={color} strokeWidth={size * 0.04} />
      <polygon points={oct} fill="none" stroke={color} strokeWidth={size * 0.01} transform={`scale(0.82) translate(${size * 0.11},${size * 0.11})`} />
      <text x="50%" y="56%" textAnchor="middle" fontFamily="'Newsreader', serif" fontSize={size * 0.42} fill={color}>CR</text>
      <text x="50%" y="78%" textAnchor="middle" fontFamily="'Manrope', sans-serif" fontSize={size * 0.10} fill={color} letterSpacing={size * 0.02} fontWeight="700">MMXXVI</text>
    </svg>
  );
}

// Photo-placeholder block — pretty stand-in until image-slots are filled.
// Uses a synthesized portrait-like SVG (silhouette in a navy-tinted scene + passport card)
function HeroPhoto({ height = 560 }) {
  return (
    <div style={{
      position: 'relative', width: '100%', height,
      background: `linear-gradient(160deg, ${PRG.navy} 0%, ${PRG.blueDeep} 55%, #1a4ed8 100%)`,
      overflow: 'hidden',
    }}>
      {/* atmospheric grain */}
      <svg width="100%" height="100%" preserveAspectRatio="xMidYMid slice" viewBox="0 0 800 560" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <radialGradient id="prgLight" cx="35%" cy="35%" r="60%">
            <stop offset="0%" stopColor="#bcd9ff" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#0a2540" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="prgShade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0a1929" stopOpacity="0" />
            <stop offset="100%" stopColor="#0a1929" stopOpacity="0.45" />
          </linearGradient>
        </defs>
        <rect width="800" height="560" fill="url(#prgLight)" />

        {/* "person" silhouette — abstract hooded portrait */}
        <g transform="translate(220,150)">
          <ellipse cx="180" cy="130" rx="120" ry="140" fill="#0a1929" opacity="0.55" />
          <circle cx="180" cy="110" r="68" fill="#1a3257" />
          <path d="M 60 240 Q 60 180 180 180 Q 300 180 300 240 L 300 410 L 60 410 Z" fill="#0e1f3a" />
          <rect x="120" y="220" width="120" height="18" rx="2" fill="#1957d3" opacity="0.7" />

          {/* passport in hand */}
          <g transform="translate(225,260) rotate(-12)">
            <rect width="140" height="200" fill={PRG.passportNavy} stroke={PRG.gold} strokeWidth="1.4" />
            <g transform="translate(70,28)"><PrgSeal size={36} color={PRG.gold} /></g>
            <text x="70" y="120" textAnchor="middle" fontFamily="'Newsreader', serif" fontSize="14" fill="#e8e0cc">CryptRepublic</text>
            <text x="70" y="142" textAnchor="middle" fontFamily="'Manrope'" fontSize="8" fill={PRG.gold} letterSpacing="1.6">PASSPORT</text>
            <line x1="14" y1="160" x2="126" y2="160" stroke={PRG.gold} strokeWidth="0.6" />
            <text x="70" y="175" textAnchor="middle" fontFamily="'Manrope'" fontSize="9" fill="#e8e0cc">CITIZEN №04392</text>
          </g>
        </g>

        <rect width="800" height="560" fill="url(#prgShade)" />
      </svg>
    </div>
  );
}

function GovBadge({ dark = false }) {
  // "Ratified by the Cabinet · MMXXVI" — replaces e-Residency's "Backed by the Government of Estonia"
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 10,
      padding: '7px 14px 7px 8px',
      border: `1px solid ${dark ? 'rgba(255,255,255,0.25)' : PRG.border}`,
      background: dark ? 'rgba(255,255,255,0.06)' : '#fff',
      borderRadius: 999,
      color: dark ? '#fff' : PRG.ink,
      fontSize: 12, fontWeight: 600, letterSpacing: '0.02em',
      fontFamily: "'Manrope', sans-serif",
    }}>
      <PrgSeal size={22} color={dark ? '#fff' : PRG.blue} />
      Ratified by the Cabinet of the Republic
    </div>
  );
}

function PillButton({ children, href = '#', primary, dark, style }) {
  const bg = primary ? PRG.blue : dark ? 'transparent' : '#fff';
  const fg = primary ? '#fff' : dark ? '#fff' : PRG.ink;
  const br = primary ? PRG.blue : dark ? 'rgba(255,255,255,0.35)' : PRG.border;
  return (
    <a href={href} style={{
      display: 'inline-flex', alignItems: 'center', gap: 10,
      padding: '14px 22px', borderRadius: 999,
      background: bg, color: fg, border: `1px solid ${br}`,
      fontFamily: "'Manrope', sans-serif", fontWeight: 700, fontSize: 14,
      textDecoration: 'none', letterSpacing: '0.01em',
      ...style,
    }}>{children}</a>
  );
}

function LandingProgramme() {
  return (
    <div style={{
      width: '100%', background: PRG.bg, color: PRG.ink,
      fontFamily: "'Manrope', sans-serif", fontSize: 15, lineHeight: 1.55,
    }}>
      {/* ─── TOP BAR ─── */}
      <div style={{ borderBottom: `1px solid ${PRG.border}`, padding: '18px 48px', display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <PrgSeal size={32} color={PRG.blue} />
          <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: '-0.01em' }}>CryptRepublic</div>
          <span style={{ marginLeft: 8, fontSize: 11, color: PRG.muted, padding: '3px 8px', border: `1px solid ${PRG.border}`, borderRadius: 999, fontWeight: 600 }}>NETWORK STATE №001</span>
        </div>
        <nav style={{ display: 'flex', gap: 28, fontSize: 14, fontWeight: 600 }}>
          <a href="#" style={{ color: PRG.ink, textDecoration: 'none' }}>How it works</a>
          <a href="#" style={{ color: PRG.ink, textDecoration: 'none' }}>Resources</a>
          <a href="#" style={{ color: PRG.ink, textDecoration: 'none' }}>Embassies</a>
          <a href="#" style={{ color: PRG.ink, textDecoration: 'none' }}>Constitution</a>
          <a href="#" style={{ color: PRG.ink, textDecoration: 'none' }}>Treasury</a>
        </nav>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <a href="Dashboard.html" style={{ alignSelf: 'center', color: PRG.muted, textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>Sign in</a>
          <PillButton href="Dashboard.html" primary>Mint passport</PillButton>
        </div>
      </div>

      {/* ─── HERO ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, borderBottom: `1px solid ${PRG.border}` }}>
        <div style={{ padding: '88px 64px', display: 'flex', flexDirection: 'column', justifyContent: 'center', maxWidth: 720 }}>
          <GovBadge />
          <h1 style={{
            fontSize: 76, lineHeight: 1.02, margin: '24px 0 0', fontWeight: 800,
            letterSpacing: '-0.025em', color: PRG.ink,
          }}>
            Become a citizen of <span style={{ color: PRG.blue }}>the world's first</span> network state.
          </h1>
          <p style={{ fontSize: 19, lineHeight: 1.5, color: PRG.muted, marginTop: 28, maxWidth: 540 }}>
            CryptRepublic is a sovereign collective without territory. Mint a soulbound passport,
            vote on every law, hold $CRYPT, and reside in 27 embassies worldwide.
            Backed by the Cabinet, governed by code, recognized in time.
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 36 }}>
            <PillButton href="Dashboard.html" primary>Mint your passport →</PillButton>
            <PillButton href="#how">See how it works</PillButton>
          </div>
          <div style={{ marginTop: 36, display: 'flex', gap: 32, alignItems: 'center', flexWrap: 'wrap' }}>
            {[
              ['48,392', 'citizens'],
              ['91', 'countries'],
              ['27', 'embassies'],
              ['$14.2M', 'treasury'],
            ].map(([n, l]) => (
              <div key={l}>
                <div style={{ fontSize: 24, fontWeight: 800, color: PRG.ink, letterSpacing: '-0.02em' }}>{n}</div>
                <div style={{ fontSize: 12, color: PRG.muted, fontWeight: 600, letterSpacing: '0.02em', textTransform: 'uppercase' }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
        <HeroPhoto />
      </div>

      {/* ─── 3 PILLARS ─── */}
      <div style={{ padding: '96px 64px', borderBottom: `1px solid ${PRG.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', marginBottom: 48, gap: 32 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: PRG.blue, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Why CryptRepublic</div>
            <h2 style={{ fontSize: 56, fontWeight: 800, letterSpacing: '-0.025em', margin: '8px 0 0', lineHeight: 1.05 }}>
              A nation built for the<br />borderless century.
            </h2>
          </div>
          <a href="#" style={{ color: PRG.blue, fontWeight: 700, textDecoration: 'none', fontSize: 14 }}>Read the Constitution →</a>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
          {[
            {
              title: 'Feel cryptographically secure',
              body: 'A soulbound passport you cannot lose, sell, or have revoked. Your identity is signed by the chain and witnessed by 48,392 citizens.',
              link: 'See why we are trusted',
              img: 'IDCARD',
            },
            {
              title: 'Unrivalled civic agency',
              body: 'Every law is voted on-chain by every citizen. No representatives. No delegates. The parliament is the people, and it does not adjourn.',
              link: 'Explore governance',
              img: 'VOTE',
            },
            {
              title: 'Join an active community',
              body: 'Reside in 27 embassies, attend weekly oath signings, and connect with citizens across 91 countries — bound by a single Constitution.',
              link: 'Learn how to participate',
              img: 'EMBASSY',
            },
          ].map((p) => (
            <a key={p.title} href="#" style={{
              display: 'block', background: PRG.panel, color: PRG.ink,
              borderRadius: 18, overflow: 'hidden', textDecoration: 'none',
              border: `1px solid ${PRG.border}`,
            }}>
              <PillarImage kind={p.img} />
              <div style={{ padding: 28 }}>
                <h3 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-0.015em' }}>{p.title}</h3>
                <p style={{ marginTop: 12, fontSize: 14, color: PRG.muted, lineHeight: 1.55 }}>{p.body}</p>
                <div style={{ marginTop: 18, fontSize: 14, fontWeight: 700, color: PRG.blue }}>{p.link} →</div>
              </div>
            </a>
          ))}
        </div>
      </div>

      {/* ─── 3-STEP PROCESS ─── */}
      <div id="how" style={{ padding: '96px 64px', borderBottom: `1px solid ${PRG.border}` }}>
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: PRG.blue, letterSpacing: '0.08em', textTransform: 'uppercase' }}>How it works</div>
          <h2 style={{ fontSize: 56, fontWeight: 800, letterSpacing: '-0.025em', margin: '8px 0 0', lineHeight: 1.05 }}>Three steps to citizenship.</h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, border: `1px solid ${PRG.border}`, borderRadius: 18, overflow: 'hidden' }}>
          {[
            {
              step: '01',
              dur: '~72 hours',
              title: 'Mint your passport',
              body: 'Sign the oath of entry, attest your identity, and pay the mint fee (0.04 ETH). Your soulbound passport is sealed at the next block.',
            },
            {
              step: '02',
              dur: '~24 hours',
              title: 'Cast your first oath',
              body: 'Voting power activates within 72 hours. Cast your position on 14 open amendments and join the consensus of the Republic.',
            },
            {
              step: '03',
              dur: 'as long as you like',
              title: 'Reside in the Republic',
              body: 'Visit any of 27 embassies. Attend weekly oath signings. Stake $CRYPT. Build with 48,392 fellow citizens across 91 countries.',
            },
          ].map((s, i) => (
            <div key={s.step} style={{
              padding: '40px 32px', background: '#fff',
              borderRight: i < 2 ? `1px solid ${PRG.border}` : 'none',
            }}>
              <StepIcon kind={s.step} />
              <div style={{ marginTop: 28, display: 'flex', alignItems: 'baseline', gap: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: PRG.blue, letterSpacing: '0.02em' }}>STEP {s.step}</span>
                <span style={{ fontSize: 13, color: PRG.muted, fontWeight: 600 }}>· {s.dur}</span>
              </div>
              <h3 style={{ fontSize: 28, fontWeight: 800, margin: '8px 0 12px', letterSpacing: '-0.02em' }}>{s.title}</h3>
              <p style={{ fontSize: 15, color: PRG.muted, lineHeight: 1.55, margin: 0 }}>{s.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ─── BIG STAT BLOCKS ─── */}
      <div style={{ padding: '96px 64px', borderBottom: `1px solid ${PRG.border}`, background: PRG.panel }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
          {[
            ['$14.2M', 'Combined treasury · 14.2M $CRYPT in reserve, governed by every citizen.'],
            ['48,392', 'Citizens worldwide · across 91 countries, growing by 412 per day.'],
          ].map(([n, l]) => (
            <div key={n} style={{
              background: '#fff', padding: '48px 40px',
              borderRadius: 18, border: `1px solid ${PRG.border}`,
            }}>
              <div style={{
                fontSize: 104, fontWeight: 800, letterSpacing: '-0.04em',
                lineHeight: 1, color: PRG.ink, fontFamily: "'Manrope', sans-serif",
              }}>{n}</div>
              <p style={{ marginTop: 16, fontSize: 17, color: PRG.muted, lineHeight: 1.45, margin: '16px 0 0' }}>{l}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ─── TESTIMONIALS ─── */}
      <div style={{ padding: '96px 64px', borderBottom: `1px solid ${PRG.border}` }}>
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: PRG.blue, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Voices of the Republic</div>
          <h2 style={{ fontSize: 56, fontWeight: 800, letterSpacing: '-0.025em', margin: '8px 0 0', lineHeight: 1.05 }}>Why citizens stayed.</h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
          {[
            { q: 'I was a tax resident of three countries before CryptRepublic. Now I am a citizen of one — and it answers only to its citizens.', name: 'Christine Sidonie', role: 'Citizen №01 482 · Lisbon', tint: '#1957d3' },
            { q: 'The passport cannot be sold. That alone changed how I think about identity. Six months in, the Republic feels more real than my birth nation.', name: 'Georg Klausner', role: 'Citizen №02 117 · Vienna', tint: '#0e3a9b' },
            { q: 'I voted on fourteen amendments last month. Try doing that in a representative democracy. The Republic is the parliament, and it is always in session.', name: 'Dr. Priya Abraham', role: 'Citizen №03 408 · London', tint: '#00b3e6' },
          ].map((t) => (
            <div key={t.name} style={{ background: '#fff', border: `1px solid ${PRG.border}`, borderRadius: 18, padding: 28, display: 'flex', flexDirection: 'column' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: `linear-gradient(135deg, ${t.tint}, ${PRG.navy})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 22, letterSpacing: '-0.02em' }}>
                {t.name.split(' ').map((p) => p[0]).join('').slice(0, 2)}
              </div>
              <p style={{ marginTop: 20, fontSize: 16, color: PRG.ink, lineHeight: 1.5, margin: '20px 0 0' }}>"{t.q}"</p>
              <div style={{ marginTop: 'auto', paddingTop: 20 }}>
                <div style={{ fontSize: 15, fontWeight: 800 }}>{t.name}</div>
                <div style={{ fontSize: 13, color: PRG.muted, marginTop: 2 }}>{t.role}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── PASSPORT KIT CTA (mirror of e-Residency's "kit" block) ─── */}
      <div style={{ padding: '0', borderBottom: `1px solid ${PRG.border}`, background: PRG.navy, color: '#fff', display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: 520 }}>
        <div style={{ padding: '80px 64px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: PRG.cyan, letterSpacing: '0.08em', textTransform: 'uppercase' }}>The Republic kit</div>
          <h2 style={{ fontSize: 56, fontWeight: 800, letterSpacing: '-0.025em', margin: '8px 0 24px', lineHeight: 1.05 }}>
            One passport.<br />One oath.<br />One Republic.
          </h2>
          <p style={{ fontSize: 17, lineHeight: 1.55, color: 'rgba(255,255,255,0.78)', maxWidth: 480, margin: 0 }}>
            Every new citizen receives a soulbound digital passport, a $CRYPT starter allocation,
            voting rights from day one, and a standing invitation to all 27 embassies.
          </p>
          <div style={{ marginTop: 36, display: 'flex', gap: 12 }}>
            <PillButton href="Dashboard.html" primary>Begin your application →</PillButton>
            <PillButton href="#" dark>Read more about the programme</PillButton>
          </div>
        </div>
        <KitDiagram />
      </div>

      {/* ─── NEWSLETTER ─── */}
      <div style={{ padding: '80px 64px', borderBottom: `1px solid ${PRG.border}` }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.02em', margin: 0, lineHeight: 1.1 }}>
              Subscribe to the Census.
            </h2>
            <p style={{ marginTop: 14, fontSize: 16, color: PRG.muted, lineHeight: 1.55 }}>
              The latest from the Cabinet — citizen stories, embassy openings, amendment summaries, every fortnight.
            </p>
          </div>
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <input placeholder="E-mail address" style={{
                gridColumn: '1 / -1', padding: '16px 18px', border: `1px solid ${PRG.border}`,
                borderRadius: 10, fontSize: 15, fontFamily: 'inherit', outline: 'none', background: '#fff',
              }} />
              <select style={{ padding: '16px 18px', border: `1px solid ${PRG.border}`, borderRadius: 10, fontSize: 15, fontFamily: 'inherit', outline: 'none', background: '#fff' }}>
                <option>Country</option><option>Portugal</option><option>Estonia</option><option>Japan</option>
              </select>
              <PillButton primary style={{ justifyContent: 'center' }}>Subscribe</PillButton>
            </div>
            <p style={{ marginTop: 14, fontSize: 12, color: PRG.muted, lineHeight: 1.5 }}>
              You can unsubscribe anytime. For more details, review our Privacy Policy.
            </p>
          </div>
        </div>
      </div>

      {/* ─── FOOTER ─── */}
      <div style={{ padding: '64px 64px 32px', background: PRG.ink, color: '#fff' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 48, paddingBottom: 48, borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <PrgSeal size={36} color="#fff" />
              <div style={{ fontWeight: 800, fontSize: 22 }}>CryptRepublic</div>
            </div>
            <p style={{ marginTop: 18, fontSize: 14, color: 'rgba(255,255,255,0.62)', lineHeight: 1.55, maxWidth: 380 }}>
              The world's first network state. Ratified MMXXVI by the Cabinet of the Republic.
              Backed by 48,392 citizens. Recognized in time.
            </p>
            <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
              {['X', 'IG', 'YT', 'GH', 'RD'].map((s) => (
                <span key={s} style={{ width: 32, height: 32, border: '1px solid rgba(255,255,255,0.18)', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff' }}>{s}</span>
              ))}
            </div>
          </div>
          {[
            { h: 'About', items: ['About the Cabinet', 'The Constitution', 'Press & media', 'Statistics dashboard'] },
            { h: 'Resources', items: ['Passport renewal', 'For founders', 'For embassies', 'Citizen support'] },
            { h: 'Programme', items: ['How it works', 'Privacy policy', 'Cookie policy', 'Contact'] },
          ].map((col) => (
            <div key={col.h}>
              <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.02em', textTransform: 'uppercase' }}>{col.h}</div>
              <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
                {col.items.map((i) => (
                  <a key={i} href="#" style={{ color: 'rgba(255,255,255,0.62)', fontSize: 14, textDecoration: 'none' }}>{i}</a>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
          <span>© CryptRepublic · MMXXVI · Network State №001</span>
          <span>Block 21 408 932 · You have been observed</span>
        </div>
      </div>
    </div>
  );
}

// ─── pillar header images (abstract geometric, gov-issue feel) ─────────
function PillarImage({ kind }) {
  const h = 200;
  return (
    <div style={{ height: h, background: PRG.navy, position: 'relative', overflow: 'hidden' }}>
      <svg viewBox="0 0 400 200" width="100%" height="100%" style={{ display: 'block' }}>
        <defs>
          <linearGradient id={`pg${kind}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1a4ed8" />
            <stop offset="100%" stopColor="#0a2540" />
          </linearGradient>
        </defs>
        <rect width="400" height="200" fill={`url(#pg${kind})`} />
        {kind === 'IDCARD' && (
          <g transform="translate(120,60)">
            <rect width="160" height="100" rx="6" fill={PRG.passportNavy} stroke={PRG.gold} strokeWidth="1.2" />
            <rect x="14" y="14" width="40" height="50" fill="#1a3257" />
            <circle cx="34" cy="34" r="11" fill="#34507a" />
            <path d="M 22 64 Q 34 50 46 64 L 46 64 Z" fill="#34507a" />
            <rect x="62" y="20" width="84" height="6" fill={PRG.cyan} opacity="0.7" />
            <rect x="62" y="32" width="62" height="4" fill="#a8c0e4" opacity="0.6" />
            <rect x="62" y="42" width="74" height="4" fill="#a8c0e4" opacity="0.5" />
            <rect x="62" y="56" width="44" height="4" fill={PRG.gold} />
            <g transform="translate(130,68)"><PrgSeal size={20} color={PRG.gold} /></g>
          </g>
        )}
        {kind === 'VOTE' && (
          <g transform="translate(80,40)">
            {[0, 1, 2].map((i) => (
              <g key={i} transform={`translate(${i * 90},${i % 2 === 0 ? 0 : 24})`}>
                <rect width="76" height="58" rx="4" fill="#0e1f3a" stroke="#1a3257" strokeWidth="1" />
                <rect x="10" y="14" width="56" height="4" fill={PRG.cyan} opacity="0.75" />
                <rect x="10" y="24" width="40" height="4" fill="#a8c0e4" opacity="0.5" />
                <rect x="10" y="36" width="56" height="10" fill={i === 1 ? PRG.gold : '#1a3257'} />
              </g>
            ))}
          </g>
        )}
        {kind === 'EMBASSY' && (
          <g transform="translate(60,30)">
            <rect x="20" y="60" width="240" height="100" fill="#0e1f3a" stroke="#1a3257" />
            <polygon points="20,60 140,20 260,60" fill={PRG.cyan} opacity="0.55" stroke="#1a3257" />
            {[0, 1, 2, 3, 4].map((i) => (
              <rect key={i} x={36 + i * 42} y={80} width={26} height={70} fill={PRG.passportNavy} stroke="#1a3257" />
            ))}
            <g transform="translate(132,38)"><PrgSeal size={18} color={PRG.gold} /></g>
          </g>
        )}
      </svg>
    </div>
  );
}

function StepIcon({ kind }) {
  const sz = 64;
  return (
    <div style={{ width: sz, height: sz, borderRadius: 16, background: PRG.panel, border: `1px solid ${PRG.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        {kind === '01' && (
          <g stroke={PRG.blue} strokeWidth="1.6" fill="none">
            <rect x="6" y="4" width="20" height="24" rx="2" />
            <line x1="10" y1="10" x2="22" y2="10" />
            <line x1="10" y1="15" x2="22" y2="15" />
            <line x1="10" y1="20" x2="18" y2="20" />
            <circle cx="22" cy="24" r="3" fill={PRG.gold} stroke="none" />
          </g>
        )}
        {kind === '02' && (
          <g stroke={PRG.blue} strokeWidth="1.6" fill="none">
            <path d="M 4 16 L 14 22 L 28 8" />
            <circle cx="16" cy="16" r="13" />
          </g>
        )}
        {kind === '03' && (
          <g stroke={PRG.blue} strokeWidth="1.6" fill="none">
            <circle cx="16" cy="16" r="13" />
            <ellipse cx="16" cy="16" rx="13" ry="6" />
            <line x1="3" y1="16" x2="29" y2="16" />
            <line x1="16" y1="3" x2="16" y2="29" />
          </g>
        )}
      </svg>
    </div>
  );
}

function KitDiagram() {
  return (
    <div style={{ position: 'relative', background: `linear-gradient(135deg, #0e2a5c 0%, ${PRG.navy} 100%)`, overflow: 'hidden' }}>
      <svg viewBox="0 0 600 520" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" style={{ display: 'block' }}>
        {/* Open passport */}
        <g transform="translate(120,140) rotate(-6)">
          <rect width="160" height="220" fill={PRG.passportNavy} stroke={PRG.gold} strokeWidth="1.6" />
          <g transform="translate(80,40)"><PrgSeal size={48} color={PRG.gold} /></g>
          <text x="80" y="130" textAnchor="middle" fontFamily="'Newsreader',serif" fontSize="18" fill="#e8e0cc">CryptRepublic</text>
          <text x="80" y="150" textAnchor="middle" fontFamily="'Manrope'" fontSize="10" fill={PRG.gold} letterSpacing="2">PASSPORT</text>
          <line x1="20" y1="166" x2="140" y2="166" stroke={PRG.gold} strokeWidth="0.8" />
          <text x="80" y="182" textAnchor="middle" fontFamily="'Manrope'" fontSize="11" fill="#e8e0cc">CITIZEN №04392</text>
          <text x="80" y="200" textAnchor="middle" fontFamily="'Manrope'" fontSize="9" fill="#9fb3d0">ISSUED · NEVER EXPIRES</text>
        </g>
        {/* Card / chip */}
        <g transform="translate(320,200) rotate(8)">
          <rect width="200" height="124" rx="8" fill="#0e1f3a" stroke={PRG.cyan} strokeWidth="0.8" />
          <rect x="14" y="14" width="34" height="26" rx="4" fill={PRG.gold} />
          <rect x="14" y="14" width="34" height="26" rx="4" fill="none" stroke="#0a1929" strokeWidth="0.4" strokeDasharray="3 2" />
          <text x="14" y="64" fontFamily="'Manrope'" fontSize="9" fill={PRG.cyan} letterSpacing="1.4">CITIZEN ID</text>
          <text x="14" y="80" fontFamily="'Manrope'" fontSize="14" fill="#fff" fontWeight="700">№04392</text>
          <text x="14" y="100" fontFamily="'Manrope'" fontSize="8" fill="#9fb3d0" letterSpacing="1.4">CRYPTREPUBLIC · MMXXVI</text>
          <g transform="translate(160,90)"><PrgSeal size={22} color={PRG.gold} /></g>
        </g>
        {/* Coin */}
        <g transform="translate(380,90)">
          <circle r="42" fill="#1a4ed8" stroke={PRG.gold} strokeWidth="1.4" />
          <text textAnchor="middle" y="6" fontFamily="'Newsreader',serif" fontSize="34" fill={PRG.gold}>₡</text>
          <text textAnchor="middle" y="24" fontFamily="'Manrope'" fontSize="7" fill="#fff" letterSpacing="1.2">CRYPT</text>
        </g>
      </svg>
    </div>
  );
}

window.LandingProgramme = LandingProgramme;
