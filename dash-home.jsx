// dash-home.jsx — Citizen home screen + shared helpers/components used everywhere
const { useState: useS, useEffect: useE, useMemo: useM, useRef: useR } = React;

// ─── SHARED HELPERS ────────────────────────────────────────────────────
function useTokens() {
  const [t, setT] = useS(window.CR_TOKENS());
  useE(() => {
    const id = setInterval(() => setT(window.CR_TOKENS()), 200);
    return () => clearInterval(id);
  }, []);
  return t;
}
window.useTokens = useTokens;

function LiveNumber({ base, step = 1, interval = 1500, format = (n) => n.toLocaleString('en-US').replace(/,/g, ' '), style }) {
  const [n, setN] = useS(base);
  useE(() => { setN(base); }, [base]);
  useE(() => {
    const id = setInterval(() => setN((x) => x + (Math.random() < 0.75 ? step : 0)), interval);
    return () => clearInterval(id);
  }, [step, interval]);
  return <span style={style}>{format(n)}</span>;
}
window.LiveNumber = LiveNumber;

function Card({ children, style, t }) {
  const tk = t || useTokens();
  return (
    <div style={{
      background: tk.cardBg, border: `1px solid ${tk.rule}`, borderRadius: 10,
      ...style,
    }}>{children}</div>
  );
}
window.Card = Card;

function StatTile({ k, label, hint, accent }) {
  const t = useTokens();
  return (
    <Card style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 4, minHeight: 110 }}>
      <div style={{ fontSize: 10, color: t.muted, letterSpacing: '0.12em', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 800, color: accent || t.fg, letterSpacing: '-0.02em', fontFamily: "'Manrope', sans-serif", marginTop: 2 }}>{k}</div>
      {hint && <div style={{ fontSize: 11, color: t.muted, marginTop: 2 }}>{hint}</div>}
    </Card>
  );
}
window.StatTile = StatTile;

function Tag({ children, fg, bg, border }) {
  const t = useTokens();
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '3px 8px',
      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
      color: fg || t.tag, background: bg || 'transparent',
      border: `1px solid ${border || t.rule}`, borderRadius: 999, textTransform: 'uppercase',
    }}>{children}</span>
  );
}
window.Tag = Tag;

function PassportPreview({ no = '04392', name = 'A. NAKADAI', issued = 'BLK 21 408 920', dense = false }) {
  const t = useTokens();
  const w = dense ? 240 : 280;
  const h = dense ? 340 : 400;
  return (
    <svg width={w} height={h} viewBox="0 0 280 400" style={{ display: 'block' }}>
      <rect width="280" height="400" rx="6" fill={t.passportBg} />
      <rect x="6" y="6" width="268" height="388" rx="3" fill="none" stroke={t.accentGold} strokeWidth="0.7" />
      <g transform="translate(112,40)">
        {/* mini seal */}
        <g fill="none" stroke={t.accentGold} strokeWidth="1.4">
          <polygon points={`28,0 47,8 56,28 47,48 28,56 9,48 0,28 9,8`} />
        </g>
        <text x="28" y="34" textAnchor="middle" fontFamily="'Newsreader', serif" fontSize="18" fill={t.accentGold}>CR</text>
      </g>
      <text x="140" y="130" textAnchor="middle" fontFamily="'Newsreader', serif" fontSize="22" fontStyle="italic" fill={t.passportFg}>CryptRepublic</text>
      <text x="140" y="148" textAnchor="middle" fontFamily="'Manrope', sans-serif" fontSize="9" fill={t.accentGold} letterSpacing="3" fontWeight="700">SOULBOUND PASSPORT</text>
      <line x1="32" y1="170" x2="248" y2="170" stroke={t.accentGold} strokeWidth="0.6" />
      <text x="32" y="200" fontFamily="'Manrope'" fontSize="9" fill={t.passportFg} opacity="0.6" letterSpacing="1.6">CITIZEN №</text>
      <text x="32" y="222" fontFamily="'Manrope'" fontSize="22" fill={t.passportFg} fontWeight="800">{no}</text>
      <text x="32" y="252" fontFamily="'Manrope'" fontSize="9" fill={t.passportFg} opacity="0.6" letterSpacing="1.6">NAME</text>
      <text x="32" y="270" fontFamily="'Manrope'" fontSize="14" fill={t.passportFg} fontWeight="700">{name}</text>
      <text x="32" y="300" fontFamily="'Manrope'" fontSize="9" fill={t.passportFg} opacity="0.6" letterSpacing="1.6">ISSUED</text>
      <text x="32" y="316" fontFamily="'JetBrains Mono', monospace" fontSize="11" fill={t.passportFg}>{issued}</text>
      <text x="32" y="344" fontFamily="'Manrope'" fontSize="9" fill={t.passportFg} opacity="0.6" letterSpacing="1.6">VALIDITY</text>
      <text x="32" y="360" fontFamily="'Manrope'" fontSize="11" fill={t.accentGold} fontWeight="700">PERPETUAL</text>
      {/* MRZ */}
      <text x="32" y="384" fontFamily="'JetBrains Mono', monospace" fontSize="8" fill={t.passportFg} opacity="0.65" letterSpacing="0.6">P&lt;CRYPT&lt;NAKADAI&lt;&lt;A&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;</text>
    </svg>
  );
}
window.PassportPreview = PassportPreview;

// ─── HOME SCREEN ───────────────────────────────────────────────────────
function HomeScreen({ goto, citizenNo }) {
  const t = useTokens();
  return (
    <div style={{ padding: 32, display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, minWidth: 0 }}>
        {/* Salutation */}
        <Card style={{ padding: '32px 32px 28px', background: t.cardBg, position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 20 }}>
            <div>
              <div style={{ fontSize: 11, color: t.muted, letterSpacing: '0.12em', fontWeight: 700 }}>SALUTATION · BLOCK 21 408 932</div>
              <h2 style={{ fontFamily: "'Newsreader', serif", fontStyle: 'italic', fontSize: 44, fontWeight: 500, lineHeight: 1.05, margin: '10px 0 0', letterSpacing: '-0.02em' }}>
                Welcome back, Citizen №{citizenNo}.
              </h2>
              <p style={{ fontSize: 15, color: t.muted, marginTop: 12, maxWidth: 540, lineHeight: 1.55 }}>
                You have <b style={{ color: t.gold }}>3 obligations</b> outstanding. The Cabinet sits at <b style={{ color: t.fg }}>14:22 UTC</b> tomorrow. Your standing in the Republic is <b style={{ color: t.success }}>active</b>.
              </p>
            </div>
            <Tag bg={t.selectedBg} fg={t.gold} border={t.gold}>✓ ACTIVE STANDING</Tag>
          </div>

          {/* In-line obligation list */}
          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { t: 'Cast oath on Amendment §47 — Embassy Quorum', d: 'closes in 18h', urgent: true },
              { t: 'Witness the new citizen induction (4 of 7 attested)', d: 'today 16:00 UTC' },
              { t: 'Review Treasury Q2 disbursement', d: 'within 5 days' },
            ].map((o) => (
              <div key={o.t} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', background: t.bg, borderRadius: 8, border: `1px solid ${t.rule}` }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: o.urgent ? t.gold : t.muted, flexShrink: 0 }} />
                <div style={{ flex: 1, fontSize: 14, color: t.fg, fontWeight: 500 }}>{o.t}</div>
                <div style={{ fontSize: 11, color: t.muted, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.04em' }}>{o.d}</div>
                <button onClick={() => goto(o.t.includes('Treasury') ? 'treasury' : 'governance')} style={{
                  fontSize: 11, fontWeight: 700, padding: '5px 10px',
                  background: 'transparent', border: `1px solid ${t.rule}`,
                  color: t.fg, borderRadius: 6, cursor: 'pointer',
                  letterSpacing: '0.04em', fontFamily: 'inherit',
                }}>OPEN →</button>
              </div>
            ))}
          </div>
        </Card>

        {/* Stat row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          <StatTile k="412" label="VOTES CAST" hint="98.6% participation" accent={t.gold} />
          <StatTile k="$2 480" label="$CRYPT BALANCE" hint="+ 124 staking" />
          <StatTile k="7" label="EMBASSY VISITS" hint="Lisbon · Tallinn · Tokyo" />
          <StatTile k="14" label="WITNESS COUNT" hint="last 30 days" />
        </div>

        {/* Recent Republic activity */}
        <Card style={{ padding: 0 }}>
          <div style={{ padding: '18px 22px', borderBottom: `1px solid ${t.rule}`, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div>
              <h3 style={{ margin: 0, fontFamily: "'Newsreader', serif", fontStyle: 'italic', fontSize: 22, fontWeight: 500 }}>The ledger of the Republic</h3>
              <div style={{ fontSize: 12, color: t.muted, marginTop: 4 }}>Last 24 hours · ordered by block</div>
            </div>
            <span style={{ fontSize: 11, color: t.muted, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.04em' }}>UPDATED 04S AGO</span>
          </div>
          <div>
            {[
              ['21 408 931', '14:22:08', 'AMENDMENT', '§47 — Embassy Quorum entered debate', '13 421 yea · 4 102 nay · 18 hours remain', t.gold],
              ['21 408 902', '14:18:44', 'INDUCTION', 'Citizen №48 392 minted in Buenos Aires', 'attested by 7 of 7 witnesses', t.success],
              ['21 408 876', '14:14:12', 'TREASURY', '$148 200 disbursed to Embassy Tallinn', 'unanimous · block 21 408 871', t.fg],
              ['21 408 802', '14:02:09', 'EMBASSY', 'Buenos Aires reached operational quorum', '108 citizens · ratified 21 408 800', t.gold],
              ['21 408 740', '13:48:55', 'AMENDMENT', '§46 — Translation Mandate passed', '38 902 yea · 9 481 nay · enrolled', t.success],
              ['21 408 711', '13:42:08', 'CENSUS', 'Population crossed 48 000 citizens', '+ 412 since previous block', t.fg],
            ].map((row, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '120px 80px 110px 1fr 200px',
                gap: 16, alignItems: 'center', padding: '14px 22px',
                borderTop: i === 0 ? 'none' : `1px solid ${t.rule}`,
                fontSize: 13,
              }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: t.muted, letterSpacing: '0.04em' }}>{row[0]}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: t.muted }}>{row[1]}</div>
                <Tag fg={row[5]} border={row[5]}>{row[2]}</Tag>
                <div style={{ color: t.fg, fontWeight: 500 }}>{row[3]}</div>
                <div style={{ color: t.muted, fontSize: 11, textAlign: 'right' }}>{row[4]}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* RIGHT RAIL */}
      <aside style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Card style={{ padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <div style={{ fontSize: 10, color: t.muted, letterSpacing: '0.12em', fontWeight: 700, alignSelf: 'flex-start' }}>YOUR PASSPORT</div>
          <PassportPreview no={citizenNo} dense />
          <button onClick={() => goto('passport')} style={{
            width: '100%', padding: '11px 14px', borderRadius: 8,
            background: t.fg, color: t.bg, border: 'none', cursor: 'pointer',
            fontFamily: 'inherit', fontWeight: 700, fontSize: 12, letterSpacing: '0.08em',
          }}>VIEW CREDENTIAL →</button>
        </Card>

        {/* Today's events */}
        <Card style={{ padding: 20 }}>
          <div style={{ fontSize: 10, color: t.muted, letterSpacing: '0.12em', fontWeight: 700 }}>TODAY · EMBASSIES</div>
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              ['LIS', '16:00', 'Oath Signing · Embassy Lisbon', '14 attending'],
              ['TYO', '19:00', 'Founder Salon · Embassy Tokyo', '38 attending'],
              ['TLL', '21:00', 'Constitutional Reading', '102 streaming'],
            ].map(([c, time, title, sub]) => (
              <div key={title} style={{ display: 'flex', gap: 12, alignItems: 'start' }}>
                <div style={{ width: 38, height: 38, background: t.bg, border: `1px solid ${t.rule}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, color: t.gold, letterSpacing: '0.04em', flexShrink: 0 }}>{c}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: t.muted, fontFamily: "'JetBrains Mono', monospace" }}>{time} UTC</div>
                  <div style={{ fontSize: 13, color: t.fg, fontWeight: 600, marginTop: 1, lineHeight: 1.3 }}>{title}</div>
                  <div style={{ fontSize: 11, color: t.muted, marginTop: 1 }}>{sub}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Census ticker */}
        <Card style={{ padding: 20, background: t.bg }}>
          <div style={{ fontSize: 10, color: t.muted, letterSpacing: '0.12em', fontWeight: 700 }}>CENSUS · LIVE</div>
          <div style={{ marginTop: 12, fontFamily: "'JetBrains Mono', monospace", fontSize: 26, fontWeight: 700, color: t.gold, letterSpacing: '-0.02em' }}>
            <LiveNumber base={48392} step={1} interval={1800} />
          </div>
          <div style={{ fontSize: 11, color: t.muted, marginTop: 2 }}>citizens, +412 today</div>
          <div style={{ marginTop: 14, fontSize: 11, color: t.muted, lineHeight: 1.5 }}>
            91 countries · 27 embassies · 14 amendments in debate
          </div>
        </Card>
      </aside>
    </div>
  );
}
window.HomeScreen = HomeScreen;
