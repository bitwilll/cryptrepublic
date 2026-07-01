// dash-population-embassies.jsx — Population, Passport, Embassies screens
const { useState: useSP } = React;

// ─── POPULATION ────────────────────────────────────────────────────────
function PopulationScreen() {
  const t = useTokens();

  // Simulated city pins on a Mercator-ish projection (rough lon/lat → x/y in 800x420)
  const CITIES = [
    { c: 'LIS', n: 'Lisbon',     x: 360, y: 200, pop: 4108, em: true },
    { c: 'TLL', n: 'Tallinn',    x: 462, y: 132, pop: 3814, em: true },
    { c: 'TYO', n: 'Tokyo',      x: 700, y: 198, pop: 6210, em: true },
    { c: 'NYC', n: 'New York',   x: 230, y: 196, pop: 5402, em: true },
    { c: 'BUE', n: 'Buenos Aires', x: 270, y: 332, pop: 2890, em: true },
    { c: 'LAG', n: 'Lagos',      x: 420, y: 270, pop: 1894, em: true },
    { c: 'SIN', n: 'Singapore',  x: 632, y: 290, pop: 2402, em: true },
    { c: 'BLR', n: 'Bengaluru',  x: 580, y: 252, pop: 2102, em: false },
    { c: 'BER', n: 'Berlin',     x: 430, y: 162, pop: 3210, em: true },
    { c: 'MEX', n: 'Mexico C.',  x: 180, y: 240, pop: 1604, em: false },
    { c: 'AKL', n: 'Auckland',   x: 760, y: 360, pop: 802, em: false },
    { c: 'DXB', n: 'Dubai',      x: 510, y: 232, pop: 1410, em: true },
  ];

  return (
    <div style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Card style={{ padding: '28px 32px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 20, alignItems: 'end' }}>
          <div>
            <div style={{ fontSize: 11, color: t.muted, letterSpacing: '0.12em', fontWeight: 700 }}>LIVE CENSUS · BLOCK 21 408 932</div>
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 16 }}>
              <span style={{ fontSize: 72, fontWeight: 800, color: t.fg, letterSpacing: '-0.04em', lineHeight: 1, fontFamily: "'Manrope'" }}>
                <LiveNumber base={48392} step={1} interval={1500} />
              </span>
              <span style={{ fontSize: 18, color: t.success, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>+412 / 24h</span>
            </div>
            <div style={{ marginTop: 4, fontSize: 14, color: t.muted, fontFamily: "'Newsreader', serif", fontStyle: 'italic' }}>
              Citizens, in 91 countries, across 27 embassies.
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: 24, alignItems: 'center' }}>
            {[['91', 'COUNTRIES'], ['27', 'EMBASSIES'], ['98.6%', 'PARTICIPATION']].map(([n, l]) => (
              <div key={l} style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: t.gold, fontFamily: "'Manrope'", letterSpacing: '-0.02em' }}>{n}</div>
                <div style={{ fontSize: 10, color: t.muted, letterSpacing: '0.08em', fontWeight: 700 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card style={{ padding: '24px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ fontFamily: "'Newsreader', serif", fontStyle: 'italic', fontSize: 22, fontWeight: 500 }}>The Republic on earth</div>
          <Tag>LIVE · ATTESTATIONS</Tag>
        </div>
        <svg viewBox="0 0 800 420" width="100%" style={{ marginTop: 16, display: 'block' }}>
          {/* dotted world */}
          <defs>
            <pattern id="dotmap" x="0" y="0" width="6" height="6" patternUnits="userSpaceOnUse">
              <circle cx="3" cy="3" r="0.7" fill={t.muted} opacity="0.35" />
            </pattern>
          </defs>
          <rect width="800" height="420" fill={t.bg} />
          {/* Stylised continents — rough rounded blobs */}
          <g fill="url(#dotmap)">
            <path d="M 80 130 Q 180 90 290 130 Q 320 200 280 240 Q 200 260 150 220 Q 100 200 80 130 Z" />
            <path d="M 200 260 Q 240 250 270 290 Q 290 340 250 380 Q 220 380 200 350 Z" />
            <path d="M 320 110 Q 420 90 510 130 Q 540 180 520 220 Q 460 250 380 220 Q 330 180 320 110 Z" />
            <path d="M 360 240 Q 420 240 460 270 Q 470 310 430 320 Q 380 320 360 280 Z" />
            <path d="M 540 110 Q 640 90 740 130 Q 760 200 710 240 Q 620 250 560 220 Q 530 180 540 110 Z" />
            <path d="M 580 280 Q 660 290 720 320 Q 720 360 660 360 Q 610 350 580 320 Z" />
            <path d="M 740 340 Q 770 340 780 360 Q 770 380 740 380 Z" />
          </g>
          {/* Lines between embassies */}
          <g stroke={t.gold} strokeWidth="0.4" opacity="0.4" fill="none">
            {CITIES.filter(c => c.em).flatMap((a, i, arr) =>
              arr.slice(i + 1, i + 3).map((b, k) => (
                <line key={`${a.c}-${b.c}-${k}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
              ))
            )}
          </g>
          {/* City pins */}
          {CITIES.map((city) => {
            const r = Math.max(6, Math.min(18, Math.sqrt(city.pop) / 18));
            return (
              <g key={city.c}>
                <circle cx={city.x} cy={city.y} r={r + 5} fill={city.em ? t.gold : t.muted} opacity="0.15" />
                <circle cx={city.x} cy={city.y} r={r} fill={city.em ? t.gold : t.muted} opacity="0.85" />
                <circle cx={city.x} cy={city.y} r="2" fill="#fff" />
                <text x={city.x + r + 6} y={city.y + 3} fontSize="10" fill={t.fg} fontFamily="'JetBrains Mono', monospace" fontWeight="700" letterSpacing="0.06em">
                  {city.c}
                </text>
                <text x={city.x + r + 6} y={city.y + 16} fontSize="9" fill={t.muted} fontFamily="'JetBrains Mono', monospace">
                  {city.pop.toLocaleString('en-US').replace(/,/g, ' ')}
                </text>
              </g>
            );
          })}
        </svg>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <Card style={{ padding: '24px 28px' }}>
          <div style={{ fontFamily: "'Newsreader', serif", fontStyle: 'italic', fontSize: 22, fontWeight: 500 }}>Top cities</div>
          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              ['Tokyo', 6210, 12.8],
              ['New York', 5402, 11.2],
              ['Lisbon', 4108, 8.5],
              ['Tallinn', 3814, 7.9],
              ['Berlin', 3210, 6.6],
              ['Buenos Aires', 2890, 5.9],
            ].map(([n, p, pct]) => (
              <div key={n} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 110px', gap: 14, alignItems: 'center' }}>
                <span style={{ fontSize: 14, color: t.fg, fontWeight: 600 }}>{n}</span>
                <div style={{ height: 8, background: t.bg, border: `1px solid ${t.rule}`, borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ width: `${(pct / 12.8) * 100}%`, height: '100%', background: t.gold }} />
                </div>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: t.fg, fontWeight: 700, textAlign: 'right' }}>{p.toLocaleString('en-US').replace(/,/g, ' ')} · {pct}%</span>
              </div>
            ))}
          </div>
        </Card>

        <Card style={{ padding: '24px 28px' }}>
          <div style={{ fontFamily: "'Newsreader', serif", fontStyle: 'italic', fontSize: 22, fontWeight: 500 }}>Recent inductions</div>
          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              ['№48 392', 'Buenos Aires', '04m ago', 'attested by 7 of 7'],
              ['№48 391', 'Tokyo',        '12m ago', 'attested by 7 of 7'],
              ['№48 390', 'Berlin',       '18m ago', 'attested by 6 of 7'],
              ['№48 389', 'Lagos',        '24m ago', 'attested by 7 of 7'],
              ['№48 388', 'Lisbon',       '32m ago', 'attested by 7 of 7'],
              ['№48 387', 'Singapore',    '41m ago', 'attested by 6 of 7'],
            ].map((row) => (
              <div key={row[0]} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 70px', gap: 14, padding: '10px 0', borderTop: `1px solid ${t.rule}`, alignItems: 'center' }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: t.gold, fontWeight: 700 }}>{row[0]}</span>
                <div>
                  <div style={{ fontSize: 13, color: t.fg, fontWeight: 600 }}>{row[1]}</div>
                  <div style={{ fontSize: 11, color: t.muted }}>{row[3]}</div>
                </div>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: t.muted, textAlign: 'right' }}>{row[2]}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
window.PopulationScreen = PopulationScreen;

// ─── PASSPORT ──────────────────────────────────────────────────────────
function PassportScreen({ citizenNo }) {
  const t = useTokens();
  return (
    <div style={{ padding: 32, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 32 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'start' }}>
        <div style={{ padding: 18, background: t.cardBg, border: `1px solid ${t.rule}`, borderRadius: 10 }}>
          <PassportPreview no={citizenNo} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ padding: '10px 16px', borderRadius: 8, background: t.fg, color: t.bg, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 12, letterSpacing: '0.04em' }}>SHARE CREDENTIAL</button>
          <button style={{ padding: '10px 16px', borderRadius: 8, background: 'transparent', color: t.fg, border: `1px solid ${t.rule}`, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 12, letterSpacing: '0.04em' }}>VIEW ON CHAIN ↗</button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
        <Card style={{ padding: '28px 32px' }}>
          <Tag fg={t.success} border={t.success}>✓ ACTIVE · SOULBOUND · SEALED</Tag>
          <h2 style={{ margin: '14px 0 0', fontFamily: "'Newsreader', serif", fontStyle: 'italic', fontSize: 40, fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1.05 }}>
            Your standing in the Republic, sealed at block 21 408 920.
          </h2>
          <p style={{ fontSize: 14, color: t.muted, lineHeight: 1.6, marginTop: 14, maxWidth: 640 }}>
            A soulbound passport is non-transferable. It cannot be sold, transferred, lost or stolen.
            It is the cryptographic record of your citizenship — verifiable by anyone, owned by you alone.
          </p>

          <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
            {[
              ['CITIZEN NUMBER', `№${citizenNo}`],
              ['ISSUED', 'BLK 21 408 920 · 2026.05.11'],
              ['VALIDITY', 'Perpetual · cannot expire'],
              ['ATTESTATIONS', '7 of 7 witnesses signed'],
              ['VOTING WEIGHT', '1.00 · permanent'],
              ['SEAL', '0x7a3f…d402'],
            ].map(([k, v]) => (
              <div key={k} style={{ padding: '12px 14px', background: t.bg, border: `1px solid ${t.rule}`, borderRadius: 8 }}>
                <div style={{ fontSize: 10, color: t.muted, letterSpacing: '0.12em', fontWeight: 700 }}>{k}</div>
                <div style={{ fontSize: 14, color: t.fg, fontWeight: 600, marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>{v}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card style={{ padding: 0 }}>
          <div style={{ padding: '18px 22px', borderBottom: `1px solid ${t.rule}` }}>
            <div style={{ fontFamily: "'Newsreader', serif", fontStyle: 'italic', fontSize: 22, fontWeight: 500 }}>Witnesses to your induction</div>
            <div style={{ fontSize: 12, color: t.muted, marginTop: 4 }}>Seven citizens attested. Their signatures are bound to your passport in perpetuity.</div>
          </div>
          <div>
            {[
              ['№00 014', 'Jean-Marc Beaulieu', 'Lisbon',     '0x4ad7…f201', '2026.05.11 · 14:18'],
              ['№00 471', 'Mette Sørensen',     'Tallinn',    '0xb12c…908e', '2026.05.11 · 14:18'],
              ['№01 482', 'Christine Sidonie',  'Lisbon',     '0x7e21…d4c0', '2026.05.11 · 14:18'],
              ['№02 117', 'Georg Klausner',     'Vienna',     '0xc88a…3f10', '2026.05.11 · 14:19'],
              ['№02 980', 'Adetokunbo Adeyemi', 'Lagos',      '0xfe22…11ba', '2026.05.11 · 14:19'],
              ['№03 408', 'Dr. Priya Abraham',  'London',     '0x9923…44df', '2026.05.11 · 14:19'],
              ['№04 102', 'Tomás Otárola',      'Buenos Aires','0xa400…0027', '2026.05.11 · 14:20'],
            ].map((row, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 120px 130px 130px', gap: 16, padding: '12px 22px', borderTop: i === 0 ? 'none' : `1px solid ${t.rule}`, alignItems: 'center', fontSize: 13 }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", color: t.gold, fontWeight: 700, fontSize: 11 }}>{row[0]}</span>
                <span style={{ color: t.fg, fontWeight: 600 }}>{row[1]}</span>
                <span style={{ color: t.muted, fontSize: 12 }}>{row[2]}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", color: t.muted, fontSize: 11 }}>{row[3]}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", color: t.muted, fontSize: 11, textAlign: 'right' }}>{row[4]}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
window.PassportScreen = PassportScreen;

// ─── EMBASSIES ─────────────────────────────────────────────────────────
function EmbassiesScreen() {
  const t = useTokens();
  const EMB = [
    { c: 'LIS', n: 'Lisbon',      ne: 'Avenida da Liberdade · Príncipe Real',  cit: 4108, hr: 'Mon–Sun · 09–22 WET',  events: 14, founded: '2024.11.04', flag: '#7cffa6' },
    { c: 'TLL', n: 'Tallinn',     ne: 'Telliskivi Loomelinnak · Kalamaja',     cit: 3814, hr: 'Mon–Sun · 09–21 EET',  events: 11, founded: '2024.09.18', flag: '#a8c0e4' },
    { c: 'TYO', n: 'Tokyo',       ne: 'Shimokitazawa · Setagaya',              cit: 6210, hr: 'Mon–Sun · 10–23 JST',  events: 22, founded: '2025.01.22', flag: '#ffd4a8' },
    { c: 'NYC', n: 'New York',    ne: 'East Village · Manhattan',              cit: 5402, hr: 'Mon–Sat · 10–24 EST',  events: 19, founded: '2025.02.14', flag: '#ff9d9d' },
    { c: 'BUE', n: 'Buenos Aires',ne: 'Palermo · Soho',                        cit: 2890, hr: 'Mon–Sun · 11–24 ART',  events: 8,  founded: '2026.04.21', flag: '#c8a96a' },
    { c: 'LAG', n: 'Lagos',       ne: 'Yaba · Mainland',                       cit: 1894, hr: 'Tue–Sun · 10–22 WAT',  events: 9,  founded: '2025.08.30', flag: '#7cffa6' },
    { c: 'SIN', n: 'Singapore',   ne: 'Tiong Bahru',                           cit: 2402, hr: 'Mon–Sun · 09–22 SGT',  events: 13, founded: '2025.05.04', flag: '#a8c0e4' },
    { c: 'DXB', n: 'Dubai',       ne: 'Alserkal Avenue · Al Quoz',             cit: 1410, hr: 'Sat–Thu · 10–23 GST',  events: 7,  founded: '2025.11.11', flag: '#ffd4a8' },
    { c: 'BER', n: 'Berlin',      ne: 'Mitte · Torstraße',                     cit: 3210, hr: 'Mon–Sun · 09–24 CET',  events: 16, founded: '2024.12.02', flag: '#c8a96a' },
  ];

  return (
    <div style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Card style={{ padding: '28px 32px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 20, alignItems: 'end' }}>
          <div>
            <div style={{ fontSize: 11, color: t.muted, letterSpacing: '0.12em', fontWeight: 700 }}>EMBASSIES · BLOCK 21 408 932</div>
            <h2 style={{ margin: '8px 0 0', fontFamily: "'Newsreader', serif", fontStyle: 'italic', fontSize: 44, fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1.05 }}>
              27 cities. 22 countries. <span style={{ color: t.gold }}>4 opening Q2.</span>
            </h2>
            <p style={{ fontSize: 14, color: t.muted, fontFamily: "'Newsreader', serif", fontStyle: 'italic', marginTop: 6 }}>
              Where the Republic gathers in flesh.
            </p>
          </div>
          <button style={{ padding: '12px 20px', borderRadius: 999, background: t.fg, color: t.bg, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 12, letterSpacing: '0.08em' }}>PROPOSE AN EMBASSY →</button>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {EMB.map((e, i) => (
          <Card key={e.c} style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ height: 120, background: `linear-gradient(135deg, ${e.flag}26 0%, ${t.cardBg} 100%)`, borderBottom: `1px solid ${t.rule}`, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="100%" height="100%" viewBox="0 0 320 120" style={{ position: 'absolute', inset: 0 }}>
                {/* Abstract embassy silhouette */}
                <rect x="40" y="60" width="240" height="50" fill={t.fg} opacity="0.08" />
                <polygon points="40,60 160,30 280,60" fill={e.flag} opacity="0.55" />
                {[0, 1, 2, 3, 4, 5].map((k) => (
                  <rect key={k} x={56 + k * 38} y={72} width={26} height={38} fill={t.fg} opacity="0.18" />
                ))}
              </svg>
              <div style={{ position: 'absolute', top: 12, left: 14, display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', background: t.cardBg, border: `1px solid ${t.rule}`, borderRadius: 999, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: '0.06em' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: e.flag }} />
                {e.c}
              </div>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <h3 style={{ margin: 0, fontFamily: "'Newsreader', serif", fontStyle: 'italic', fontSize: 24, fontWeight: 500, letterSpacing: '-0.01em' }}>{e.n}</h3>
                <span style={{ fontSize: 10, color: t.muted, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.04em' }}>EST {e.founded}</span>
              </div>
              <div style={{ fontSize: 13, color: t.muted, marginTop: 4 }}>{e.ne}</div>
              <div style={{ marginTop: 14, fontSize: 11, color: t.muted, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.04em' }}>{e.hr.toUpperCase()}</div>
              <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
                <Tag>{e.cit.toLocaleString('en-US').replace(/,/g, ' ')} CITIZENS</Tag>
                <Tag fg={t.gold} border={t.gold}>{e.events} EVENTS · WK</Tag>
              </div>
              <button style={{ marginTop: 16, width: '100%', padding: '10px 12px', borderRadius: 6, background: 'transparent', border: `1px solid ${t.rule}`, color: t.fg, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 11, letterSpacing: '0.06em' }}>VIEW EMBASSY →</button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
window.EmbassiesScreen = EmbassiesScreen;
