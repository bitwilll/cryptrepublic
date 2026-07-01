// CryptRepublic — Direction 03: CENSUS
// Minimal white, hyper-typographic, big numbers, deadpan civic.

function LandingCensus() {
  const C = window.CR_C;
  const root = {
    width: '100%',
    background: '#ffffff',
    color: C.ink,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 13,
    lineHeight: 1.5,
  };
  const tag = { fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase' };
  const num = { fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em' };
  const rule = `1px solid ${C.ink}`;

  return (
    <div style={root}>
      {/* Nav */}
      <div style={{ borderBottom: rule, padding: '14px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', ...tag }}>
        <span style={{ fontFamily: "'Instrument Serif', serif", fontSize: 22, letterSpacing: '0.02em', textTransform: 'none' }}>CryptRepublic</span>
        <div style={{ display: 'flex', gap: 32 }}>
          <span>CENSUS</span><span>CONSTITUTION</span><span>EMBASSIES</span><span>TREASURY</span><span>JOIN</span>
        </div>
      </div>

      {/* Hero — single statement */}
      <div style={{ padding: '120px 40px 40px', borderBottom: rule, textAlign: 'center', position: 'relative' }}>
        <div style={{ ...tag, marginBottom: 48 }}>CENSUS · BLOCK 21 408 932 · 14:22 UTC</div>
        <h1 style={{
          fontFamily: "'Instrument Serif', serif",
          fontSize: 220, lineHeight: 0.86, margin: 0, fontWeight: 400, letterSpacing: '-0.04em',
        }}>
          We are<br /><em style={{ color: C.goldDeep }}>forty-eight thousand,</em><br />three hundred and<br />ninety-two.
        </h1>
        <div style={{ marginTop: 48, display: 'flex', justifyContent: 'center', gap: 12 }}>
          <a href="Dashboard.html" style={{
            background: C.ink, color: '#fff', padding: '18px 26px',
            fontSize: 12, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
            textDecoration: 'none',
          }}>BECOME THE 48,393rd  ↗</a>
          <button style={{
            background: 'transparent', color: C.ink, padding: '18px 26px',
            fontSize: 12, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
            border: rule, cursor: 'pointer',
          }}>READ THE CONSTITUTION</button>
        </div>
      </div>

      {/* Definition strip — what is a network state */}
      <div style={{ borderBottom: rule, padding: '48px 40px', display: 'grid', gridTemplateColumns: '120px 1fr', gap: 32, alignItems: 'baseline' }}>
        <div style={{ ...tag }}>NOUN</div>
        <div>
          <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 36, fontStyle: 'italic' }}>net·work state</div>
          <div style={{ fontSize: 14, opacity: 0.78, marginTop: 6, maxWidth: 720 }}>
            <span style={{ ...tag }}>/ˈnetwərk ˌstāt/</span> &nbsp; A sovereign community
            formed online, governed by code, and recognized in time. A nation whose first claim
            is consensus, whose second is territory, and whose final is recognition.
          </div>
        </div>
      </div>

      {/* Numbers — 6-tile grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderBottom: rule }}>
        {[
          ['48 392', 'CITIZENS', 'across 91 countries'],
          ['27', 'EMBASSIES', 'in 22 cities'],
          ['$14.2M', 'TREASURY', 'reserve · $CRYPT'],
          ['14', 'AMENDMENTS', 'passed · 3 active'],
          ['73%', 'TURNOUT', 'last governance vote'],
          ['001', 'NETWORK STATE', 'no other has yet ratified'],
        ].map(([n, l, s], i) => (
          <div key={l} style={{
            padding: '56px 32px',
            borderRight: (i % 3) < 2 ? rule : 'none',
            borderTop: i > 2 ? rule : 'none',
          }}>
            <div style={{ ...num, fontSize: 88, lineHeight: 0.9, fontFamily: "'Instrument Serif', serif" }}>{n}</div>
            <div style={{ ...tag, marginTop: 16 }}>{l}</div>
            <div style={{ fontSize: 12, opacity: 0.65, marginTop: 4 }}>{s}</div>
          </div>
        ))}
      </div>

      {/* Three articles — column rule */}
      <div style={{ padding: '80px 40px', borderBottom: rule, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0 }}>
        {[
          ['I.', 'On Citizenship', 'A passport is minted, not granted. It is soulbound to one person and cannot be sold. There is no exit but death — and even then, the record remains.'],
          ['II.', 'On Governance', 'Every citizen votes on every law. There are no representatives. The chain is the parliament and the parliament does not adjourn.'],
          ['III.', 'On Recognition', 'The Republic seeks no permission. It accumulates citizens, embassies, treasury, and trade until the question is no longer whether but when.'],
        ].map(([n, t, b], i) => (
          <div key={n} style={{ padding: '0 32px', borderRight: i < 2 ? rule : 'none' }}>
            <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 84, lineHeight: 1, color: C.goldDeep }}>{n}</div>
            <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 32, fontStyle: 'italic', marginTop: 8 }}>{t}</div>
            <div style={{ fontSize: 13, lineHeight: 1.65, opacity: 0.82, marginTop: 16 }}>{b}</div>
          </div>
        ))}
      </div>

      {/* Population map (globe) */}
      <div style={{ padding: '80px 40px', borderBottom: rule, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 56, alignItems: 'center' }}>
        <div>
          <div style={{ ...tag, marginBottom: 16 }}>POPULATION · LIVE</div>
          <h2 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 80, lineHeight: 0.95, margin: 0, fontWeight: 400 }}>
            Everywhere<br />and <em style={{ color: C.goldDeep }}>nowhere.</em>
          </h2>
          <p style={{ marginTop: 24, fontSize: 14, lineHeight: 1.6, maxWidth: 460 }}>
            Citizens reside in 91 countries. The Republic does not. The map is a record of intent,
            not jurisdiction. Eight new citizens admitted in the last ninety seconds.
          </p>
          <PopulationCounter base={48392} size="lg" />
          <div style={{ ...tag, marginTop: 8, opacity: 0.6 }}>↗ updated every block</div>
        </div>
        <div style={{ justifySelf: 'end' }}>
          <Globe size={420} color={C.ink} accent={C.goldDeep} />
        </div>
      </div>

      {/* Embassies list */}
      <div style={{ padding: '64px 40px', borderBottom: rule }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 24 }}>
          <h2 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 56, lineHeight: 1, margin: 0, fontWeight: 400 }}>Embassies, 27.</h2>
          <div style={{ ...tag }}>+2 OPENING Q3</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, border: rule }}>
          {[
            ['LISBON', 'PT', '1 482 citizens'],
            ['TOKYO', 'JP', '1 211 citizens'],
            ['MEXICO CITY', 'MX', '982 citizens'],
            ['TALLINN', 'EE', '871 citizens'],
            ['SINGAPORE', 'SG', '802 citizens'],
            ['NAIROBI', 'KE', '614 citizens'],
            ['BUENOS AIRES', 'AR', '588 citizens'],
            ['BERLIN', 'DE', '512 citizens'],
            ['JAKARTA', 'ID', '441 citizens'],
            ['MEDELLIN', 'CO', '402 citizens'],
            ['SEOUL', 'KR', '388 citizens'],
            ['DENVER', 'US', '349 citizens'],
          ].map((e, i) => (
            <div key={e[0]} style={{
              padding: '18px 18px',
              borderRight: (i % 4) < 3 ? rule : 'none',
              borderTop: i > 3 ? rule : 'none',
            }}>
              <div style={{ ...tag, opacity: 0.6 }}>{e[1]}</div>
              <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 22, marginTop: 2 }}>{e[0]}</div>
              <div style={{ fontSize: 11, opacity: 0.65, marginTop: 4 }}>{e[2]}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Closing */}
      <div style={{ padding: '160px 40px 80px', textAlign: 'center' }}>
        <Seal size={64} color={C.ink} />
        <h2 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 120, lineHeight: 0.92, margin: '40px 0 0', fontWeight: 400, letterSpacing: '-0.03em' }}>
          The census is open.<br /><em style={{ color: C.goldDeep }}>Your number awaits.</em>
        </h2>
        <div style={{ marginTop: 56 }}>
          <a href="Dashboard.html" style={{
            background: C.ink, color: '#fff', padding: '22px 32px',
            fontSize: 12, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase',
            textDecoration: 'none',
          }}>MINT PASSPORT №48 393  ↗</a>
        </div>
        <div style={{ marginTop: 100, ...tag, opacity: 0.6, display: 'flex', justifyContent: 'space-between', borderTop: rule, paddingTop: 20 }}>
          <span>CRYPTREPUBLIC · MMXXVI</span>
          <span>NETWORK STATE №001</span>
          <span>YOU HAVE BEEN OBSERVED</span>
        </div>
      </div>
    </div>
  );
}

window.LandingCensus = LandingCensus;
