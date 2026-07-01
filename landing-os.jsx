// CryptRepublic — Direction 02: OPERATING LEDGER
// Forest dark + gold, terminal-flavored, the republic as live software.

function LandingOperatingLedger() {
  const C = window.CR_C;
  const root = {
    width: '100%',
    background: C.forest,
    color: C.cream,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 13,
    lineHeight: 1.5,
  };
  const tag = { fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.gold };
  const num = { fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' };

  // Live block-number ticker
  const [block, setBlock] = React.useState(21408932);
  React.useEffect(() => {
    const id = setInterval(() => setBlock((b) => b + 1), 1200);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={root}>
      {/* Topbar — terminal status line */}
      <div style={{ borderBottom: `1px solid ${C.goldDeep}`, padding: '10px 32px', display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: 24, alignItems: 'center', fontSize: 11 }}>
        <div style={{ ...tag, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, background: '#7cffa6', borderRadius: '50%', boxShadow: '0 0 8px #7cffa6' }} />
          CHAIN ONLINE
        </div>
        <div style={{ display: 'flex', gap: 24, ...tag, color: C.cream, opacity: 0.75 }}>
          <span>BLK {block.toLocaleString('en-US').replace(/,/g, ' ')}</span>
          <span>GAS 14 GWEI</span>
          <span>UPTIME 412d 06h</span>
          <span>QUORUM 73%</span>
        </div>
        <div style={{ ...tag, color: C.cream, opacity: 0.75 }}>SESSION · GUEST</div>
        <div style={{ ...tag }}>2026 · 05 · 11 · 14:22 UTC</div>
      </div>

      {/* Hero — split monitor */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', minHeight: 720, borderBottom: `1px solid ${C.goldDeep}` }}>
        <div style={{ padding: '64px 48px 48px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderRight: `1px solid ${C.goldDeep}` }}>
          <div>
            <div style={{ ...tag, marginBottom: 32 }}>$ cat /var/republic/preamble.txt</div>
            <h1 style={{
              fontFamily: "'Instrument Serif', serif",
              fontSize: 132, lineHeight: 0.88, margin: 0, fontWeight: 400, color: C.cream, letterSpacing: '-0.02em',
            }}>
              The state<br />runs on<br /><em style={{ color: C.gold }}>consensus.</em>
            </h1>
            <p style={{ marginTop: 32, fontSize: 15, lineHeight: 1.6, maxWidth: 540, color: C.cream, opacity: 0.85 }}>
              CryptRepublic is a network state — a sovereign collective without territory.
              Every law, every vote, every coin is settled on-chain. Citizenship is minted, not granted.
              You are observed.
            </p>
          </div>
          <div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <a href="Dashboard.html" style={{
                background: C.gold, color: C.forest, padding: '18px 24px',
                fontSize: 12, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase',
                textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 10,
              }}>MINT PASSPORT  ↗</a>
              <button style={{
                background: 'transparent', color: C.cream, padding: '18px 24px',
                fontSize: 12, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase',
                border: `1px solid ${C.cream}`, cursor: 'pointer',
              }}>$ ./read --constitution</button>
            </div>
            <div style={{ marginTop: 22, fontSize: 11, color: C.gold, letterSpacing: '0.14em' }}>
              › 48,392 CITIZENS · 27 EMBASSIES · 14 AMENDMENTS PASSED
            </div>
          </div>
        </div>

        {/* Globe panel */}
        <div style={{ padding: '64px 40px', display: 'flex', flexDirection: 'column', gap: 24, position: 'relative' }}>
          <div style={{ ...tag, display: 'flex', justifyContent: 'space-between' }}>
            <span>LIVE · CITIZEN NETWORK</span>
            <span>◉ REC</span>
          </div>
          <div style={{ alignSelf: 'center' }}>
            <Globe size={360} color={C.gold} accent={C.cream} />
          </div>
          <div style={{ borderTop: `1px solid ${C.goldDeep}`, paddingTop: 16 }}>
            <div style={{ ...tag, color: C.cream, opacity: 0.7, marginBottom: 12 }}>RECENT ADMISSIONS</div>
            <div style={{ fontSize: 11, lineHeight: 1.8 }}>
              {[
                ['14:22:04', '38291', 'LISBON / PT'],
                ['14:21:52', '38290', 'JAKARTA / ID'],
                ['14:21:38', '38289', 'MEXICO CITY / MX'],
                ['14:21:22', '38288', 'TALLINN / EE'],
                ['14:21:01', '38287', 'NAIROBI / KE'],
              ].map(([t, n, p]) => (
                <div key={n} style={{ display: 'grid', gridTemplateColumns: '88px 64px 1fr auto', gap: 12, color: C.cream, opacity: 0.85 }}>
                  <span style={{ color: C.gold }}>{t}</span>
                  <span>№{n}</span>
                  <span style={{ opacity: 0.7 }}>{p}</span>
                  <span style={{ color: '#7cffa6' }}>ADMITTED</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Live stats — 4 panels with sparklines */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: `1px solid ${C.goldDeep}` }}>
        {[
          { label: 'CITIZENS', val: <PopulationCounter base={48392} size="md" color={C.cream} />, delta: '+412 / 24h' },
          { label: 'TREASURY · $CRYPT', val: <span style={{ ...num, fontSize: 56, color: C.cream }}>$14.2M</span>, delta: '+0.42%' },
          { label: 'EMBASSIES', val: <span style={{ ...num, fontSize: 56, color: C.cream }}>27</span>, delta: '+2 this month' },
          { label: 'GOVERNANCE TURNOUT', val: <span style={{ ...num, fontSize: 56, color: C.cream }}>73<span style={{ fontSize: 28 }}>%</span></span>, delta: 'last vote' },
        ].map((s, i, arr) => (
          <div key={s.label} style={{ padding: '32px 28px', borderRight: i < arr.length - 1 ? `1px solid ${C.goldDeep}` : 'none' }}>
            <div style={{ ...tag, marginBottom: 8 }}>{s.label}</div>
            {s.val}
            <div style={{ marginTop: 8, fontSize: 11, color: C.gold }}>↗ {s.delta}</div>
            <Sparkline color={C.gold} />
          </div>
        ))}
      </div>

      {/* Pillars grid — "modules" of the state */}
      <div style={{ padding: '80px 40px', borderBottom: `1px solid ${C.goldDeep}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 32 }}>
          <h2 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 64, lineHeight: 1, margin: 0, fontWeight: 400, color: C.cream }}>
            Modules of the republic.
          </h2>
          <div style={{ ...tag }}>/etc/republic/services.d</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, border: `1px solid ${C.goldDeep}` }}>
          {[
            ['passport.so', 'IDENTITY', 'Soulbound credentials. One person, one passport, forever. Issued in 72h, retired at death.'],
            ['vote.gov', 'GOVERNANCE', 'On-chain proposals. Quadratic voting. No representatives, no delegates, no excuses.'],
            ['treasury.cr', 'TREASURY', '$CRYPT — the national unit of account. Backed by citizen oaths and a mixed reserve.'],
            ['embassy.dao', 'EMBASSIES', '27 cities. Co-living, co-working, weekly oaths. The republic in physical form.'],
            ['health.id', 'SERVICES', 'Borderless healthcare and banking. Issued under the seal of the Republic.'],
            ['roadmap.cr', 'RECOGNITION', 'Diplomatic status by 2028. Territorial lease by 2030. UN proposal by 2035.'],
          ].map(([host, name, desc], i) => {
            const col = i % 3;
            const row = Math.floor(i / 3);
            return (
              <div key={host} style={{
                padding: '28px 24px',
                borderRight: col < 2 ? `1px solid ${C.goldDeep}` : 'none',
                borderTop: row > 0 ? `1px solid ${C.goldDeep}` : 'none',
              }}>
                <div style={{ ...tag, color: C.cream, opacity: 0.6 }}>{host}</div>
                <h3 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 36, fontWeight: 400, margin: '8px 0 12px', color: C.cream }}>{name}</h3>
                <p style={{ fontSize: 12, lineHeight: 1.6, color: C.cream, opacity: 0.78, margin: 0 }}>{desc}</p>
                <div style={{ marginTop: 20, fontSize: 11, letterSpacing: '0.18em', color: C.gold }}>$ launch  →</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Live vote */}
      <div style={{ padding: '80px 40px', borderBottom: `1px solid ${C.goldDeep}`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 56, alignItems: 'start' }}>
        <div>
          <div style={{ ...tag, marginBottom: 16 }}>VOTE/CR-014 · LIVE</div>
          <h2 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 56, lineHeight: 1, margin: 0, fontWeight: 400, color: C.cream }}>
            Amendment XIV<br /><em style={{ color: C.gold }}>On the right to fork.</em>
          </h2>
          <p style={{ marginTop: 20, fontSize: 14, lineHeight: 1.6, color: C.cream, opacity: 0.85, maxWidth: 520 }}>
            Shall any citizen, by signed motion of ten thousand, instantiate a parallel republic
            and retain a one-time withdrawal of $CRYPT proportional to their tenure? Voting closes
            in 4d 02h 11m.
          </p>
        </div>
        <div style={{ border: `1px solid ${C.goldDeep}`, padding: 28, background: C.forestDeep }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', ...tag, marginBottom: 16 }}>
            <span>RESULT · LIVE</span><span>71.2% YES · QUORUM REACHED</span>
          </div>
          <VoteBar yes={71.2} no={22.4} abstain={6.4} />
          <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, fontSize: 12 }}>
            {[['YES', '71.2%', '34 412'], ['NO', '22.4%', '10 832'], ['ABSTAIN', '6.4%', '3 091']].map(([k, p, c]) => (
              <div key={k}>
                <div style={{ ...tag, fontSize: 10 }}>{k}</div>
                <div style={{ fontSize: 22, color: C.cream, ...num, marginTop: 4 }}>{p}</div>
                <div style={{ opacity: 0.6, ...num }}>{c}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
            <button style={{ flex: 1, background: C.gold, color: C.forest, padding: '12px 16px', fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', border: 'none', cursor: 'pointer' }}>CAST YES</button>
            <button style={{ flex: 1, background: 'transparent', color: C.cream, padding: '12px 16px', fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', border: `1px solid ${C.cream}`, cursor: 'pointer' }}>CAST NO</button>
            <button style={{ flex: 0.6, background: 'transparent', color: C.cream, padding: '12px 16px', fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', border: `1px solid ${C.goldDeep}`, cursor: 'pointer' }}>ABSTAIN</button>
          </div>
        </div>
      </div>

      <Ticker bg={C.forestDeep} color={C.gold} sep="●" items={[
        'BLK 21 408 932 SEALED', '$CRYPT 4.21 USD +0.42%', 'CITIZEN 38291 ADMITTED',
        'AMENDMENT XIV — 71% YES', 'EMBASSY LISBON OPENED', 'OATH SIGNING TOKYO 06.04',
        'TREASURY 14 248 921 $CRYPT',
      ]} />

      {/* Console / terminal demo */}
      <div style={{ padding: '80px 40px', borderBottom: `1px solid ${C.goldDeep}` }}>
        <div style={{ ...tag, marginBottom: 16 }}>$ ./republic --status</div>
        <pre style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 12, lineHeight: 1.7, color: C.cream, opacity: 0.92,
          background: C.forestDeep, padding: '24px 28px', border: `1px solid ${C.goldDeep}`, margin: 0, overflow: 'hidden',
        }}>
{`> republic-cli v2.6.1  /  block 21 408 932
> connecting to mainnet ......................... OK
> verifying citizen passport ..................... NOT FOUND
> ${'\u00a0'}
> ${'\u00a0\u00a0\u00a0'}you are not a citizen.
> ${'\u00a0\u00a0\u00a0'}there is still time.
> ${'\u00a0'}
> available commands:
>   republic mint              — claim citizenship
>   republic vote --list       — view active amendments  (14 open)
>   republic embassy           — locate nearest          (27 worldwide)
>   republic constitution      — read the founding text
>   republic oath              — submit oath of entry
> ${'\u00a0'}
> _`}
        </pre>
      </div>

      {/* Cabinet */}
      <div style={{ padding: '80px 40px', borderBottom: `1px solid ${C.goldDeep}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 32 }}>
          <h2 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 56, lineHeight: 1, margin: 0, fontWeight: 400, color: C.cream }}>
            The signatories.
          </h2>
          <div style={{ ...tag }}>/etc/republic/cabinet</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, border: `1px solid ${C.goldDeep}` }}>
          {[
            ['A. NAKADAI', 'Treasury', '0x9f3a…ca7e'],
            ['M. CORREIA', 'Constitution', '0x21bb…f041'],
            ['R. ÅSLUND', 'Embassies', '0x4d8e…7c19'],
            ['I. CHEN', 'Identity', '0xcafe…beef'],
            ['V. ROZAS', 'Services', '0x77a2…0c11'],
            ['S. OKONKWO', 'Defense', '0xd0d0…8412'],
            ['L. PARMAR', 'Records', '0xbb12…99fe'],
            ['Y. KAZIMI', 'Foreign', '0x3141…5926'],
          ].map(([name, dept, addr], i) => (
            <div key={name} style={{
              padding: '20px 18px',
              borderRight: (i % 4) < 3 ? `1px solid ${C.goldDeep}` : 'none',
              borderTop: i > 3 ? `1px solid ${C.goldDeep}` : 'none',
            }}>
              <div style={{
                aspectRatio: '4/5', background: C.forestDeep, border: `1px solid ${C.goldDeep}`, marginBottom: 12, position: 'relative',
              }}>
                <div style={{ position: 'absolute', inset: 12, background: `linear-gradient(135deg, ${C.gold} 0%, ${C.goldDeep} 60%, ${C.forestDeep} 100%)`, opacity: 0.55 }} />
                <div style={{ position: 'absolute', top: 8, left: 8, fontSize: 9, color: C.gold, letterSpacing: '0.18em' }}>№ {String(100 + i * 113 % 900).padStart(3, '0')}</div>
                <div style={{ position: 'absolute', bottom: 8, right: 8 }}><Seal size={28} color={C.gold} /></div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.cream }}>{name}</div>
              <div style={{ fontSize: 11, color: C.gold }}>MIN. of {dept}</div>
              <div style={{ fontSize: 10, color: C.cream, opacity: 0.55, marginTop: 4, ...num }}>{addr}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer / closing */}
      <div style={{ padding: '100px 40px 48px', textAlign: 'center', background: C.forestDeep }}>
        <div style={{ ...tag, marginBottom: 18 }}>$ ./republic oath --sign</div>
        <h2 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 88, lineHeight: 1, margin: 0, fontWeight: 400, fontStyle: 'italic', color: C.cream }}>
          You are <span style={{ color: C.gold }}>observed.</span>
        </h2>
        <div style={{ marginTop: 40 }}>
          <a href="Dashboard.html" style={{
            background: C.gold, color: C.forest, padding: '20px 28px',
            fontSize: 12, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase',
            textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 10,
          }}>$ republic mint  →</a>
        </div>
        <div style={{ marginTop: 60, ...tag, opacity: 0.6, display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${C.goldDeep}`, paddingTop: 20 }}>
          <span>CRYPTREPUBLIC · MMXXVI</span>
          <span>BLK {block.toLocaleString('en-US').replace(/,/g, ' ')}</span>
          <span>NO COOKIES · NO BORDERS</span>
        </div>
      </div>
    </div>
  );
}

function Sparkline({ color = '#c8a96a' }) {
  // Simple deterministic sparkline so the design is stable.
  const pts = [3, 5, 4, 7, 6, 9, 8, 11, 10, 13, 12, 15, 14, 17, 19, 18, 22];
  const max = Math.max(...pts);
  const w = 220, h = 40;
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i / (pts.length - 1)) * w},${h - (p / max) * h}`).join(' ');
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ marginTop: 12, display: 'block' }}>
      <path d={path} fill="none" stroke={color} strokeWidth="1.2" />
      <path d={`${path} L${w},${h} L0,${h} Z`} fill={color} opacity="0.12" />
    </svg>
  );
}

function VoteBar({ yes, no, abstain }) {
  const C = window.CR_C;
  return (
    <div style={{ display: 'flex', height: 36, border: `1px solid ${C.goldDeep}` }}>
      <div style={{ width: `${yes}%`, background: C.gold }} />
      <div style={{ width: `${no}%`, background: '#7a1d1d' }} />
      <div style={{ width: `${abstain}%`, background: C.goldDeep, opacity: 0.55 }} />
    </div>
  );
}

window.LandingOperatingLedger = LandingOperatingLedger;
window.Sparkline = Sparkline;
window.VoteBar = VoteBar;
