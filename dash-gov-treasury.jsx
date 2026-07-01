// dash-gov-treasury.jsx — Constitution & Active Votes + Treasury screens
const { useState: useSGT, useMemo: useMGT } = React;

// ─── GOVERNANCE ────────────────────────────────────────────────────────
function GovernanceScreen() {
  const t = useTokens();
  const [activeAmend, setActiveAmend] = useSGT(0);
  const [votes, setVotes] = useSGT({}); // amendmentId -> 'yea' | 'nay' | 'abstain'

  const AMENDMENTS = [
    { id: 47, title: 'Embassy Quorum Threshold', body: 'Reduce the minimum citizen attestation from 100 to 73 for embassy operational quorum, recognising the rapid expansion of nascent embassies in Southern hemisphere cities.', yea: 13421, nay: 4102, ab: 281, closes: '18h 04m', status: 'open', tag: 'PROCEDURAL' },
    { id: 48, title: 'Translation Mandate · Phase II', body: 'Constitutional documents to be ratified in 14 working languages within 90 days of enrolment. Establishes a permanent Translation Council reporting to the Cabinet.', yea: 22810, nay: 1908, ab: 542, closes: '2d 14h', status: 'open', tag: 'CULTURAL' },
    { id: 49, title: 'Treasury Disbursement · Embassy Buenos Aires', body: 'Authorise $148 200 from the General Reserve to fund the lease, fit-out and first-year operations of Embassy Buenos Aires (Palermo, BA).', yea: 9482, nay: 6201, ab: 412, closes: '4d 02h', status: 'open', tag: 'FISCAL' },
    { id: 50, title: 'Witness Programme Expansion', body: 'Citizens with three or more years of standing may attest up to four new inductions per quarter, raised from the current ceiling of two.', yea: 18923, nay: 2104, ab: 198, closes: '5d 18h', status: 'open', tag: 'CIVIC' },
    { id: 51, title: 'Block Time Adjustment', body: 'Reduce target block time from 12 seconds to 8 seconds, contingent on validator readiness review by the Cabinet of the Republic.', yea: 4201, nay: 12492, ab: 1840, closes: '6d 22h', status: 'open', tag: 'TECHNICAL' },
  ];
  const a = AMENDMENTS[activeAmend];
  const total = a.yea + a.nay + a.ab;

  function cast(choice) {
    setVotes((v) => ({ ...v, [a.id]: choice }));
  }
  const myVote = votes[a.id];

  return (
    <div style={{ padding: 32, display: 'grid', gridTemplateColumns: '320px 1fr', gap: 24 }}>
      {/* LEFT: list of amendments */}
      <Card style={{ padding: 0, alignSelf: 'start', position: 'sticky', top: 24 }}>
        <div style={{ padding: '16px 18px', borderBottom: `1px solid ${t.rule}` }}>
          <div style={{ fontSize: 10, color: t.muted, letterSpacing: '0.12em', fontWeight: 700 }}>OPEN AMENDMENTS · 14</div>
          <div style={{ fontFamily: "'Newsreader', serif", fontStyle: 'italic', fontSize: 18, fontWeight: 500, marginTop: 4 }}>Casting in session</div>
        </div>
        {AMENDMENTS.map((am, i) => {
          const sel = i === activeAmend;
          return (
            <button key={am.id} onClick={() => setActiveAmend(i)} style={{
              width: '100%', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 4,
              padding: '14px 18px', border: 'none',
              background: sel ? t.selectedBg : 'transparent',
              borderTop: `1px solid ${t.rule}`,
              borderLeft: sel ? `3px solid ${t.gold}` : '3px solid transparent',
              paddingLeft: sel ? 15 : 18,
              cursor: 'pointer', fontFamily: 'inherit', color: t.fg,
            }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: t.gold, fontWeight: 700 }}>§{am.id}</span>
                <Tag fg={t.muted}>{am.tag}</Tag>
                {votes[am.id] && <Tag fg={t.success} border={t.success}>VOTED</Tag>}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>{am.title}</div>
              <div style={{ fontSize: 10, color: t.muted, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.04em' }}>CLOSES {am.closes}</div>
            </button>
          );
        })}
      </Card>

      {/* RIGHT: amendment detail */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Card style={{ padding: '32px 36px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Tag fg={t.gold} border={t.gold}>OPEN · {a.closes} REMAIN</Tag>
            <Tag fg={t.muted}>{a.tag}</Tag>
          </div>
          <h2 style={{ margin: '14px 0 0', fontFamily: "'Newsreader', serif", fontStyle: 'italic', fontSize: 40, fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1.05 }}>
            <span style={{ color: t.gold }}>§{a.id}.</span> {a.title}
          </h2>
          <p style={{ fontSize: 15, color: t.muted, lineHeight: 1.6, marginTop: 18, maxWidth: 720 }}>{a.body}</p>

          {/* Vote distribution */}
          <div style={{ marginTop: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div style={{ fontSize: 11, color: t.muted, letterSpacing: '0.12em', fontWeight: 700 }}>CURRENT TALLY · {total.toLocaleString('en-US').replace(/,/g, ' ')} VOTES CAST</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: t.muted, letterSpacing: '0.04em' }}>QUORUM 73%</div>
            </div>
            <div style={{ marginTop: 10, height: 14, display: 'flex', overflow: 'hidden', borderRadius: 999, background: t.bg, border: `1px solid ${t.rule}` }}>
              <div style={{ width: `${(a.yea / total) * 100}%`, background: t.success, transition: 'width .3s' }} />
              <div style={{ width: `${(a.nay / total) * 100}%`, background: t.gold }} />
              <div style={{ width: `${(a.ab / total) * 100}%`, background: t.muted, opacity: 0.5 }} />
            </div>
            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {[
                ['YEA', a.yea, t.success],
                ['NAY', a.nay, t.gold],
                ['ABSTAIN', a.ab, t.muted],
              ].map(([k, n, c]) => (
                <div key={k} style={{ padding: '10px 12px', background: t.bg, border: `1px solid ${t.rule}`, borderLeft: `3px solid ${c}` }}>
                  <div style={{ fontSize: 10, color: t.muted, letterSpacing: '0.08em', fontWeight: 700 }}>{k}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: c, marginTop: 2, fontFamily: "'Manrope'", letterSpacing: '-0.02em' }}>{n.toLocaleString('en-US').replace(/,/g, ' ')}</div>
                  <div style={{ fontSize: 11, color: t.muted, fontFamily: "'JetBrains Mono', monospace" }}>{((n / total) * 100).toFixed(1)}%</div>
                </div>
              ))}
            </div>
          </div>

          {/* Cast a vote */}
          <div style={{ marginTop: 32, padding: 24, background: t.bg, border: `1px solid ${t.rule}`, borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: t.muted, letterSpacing: '0.12em', fontWeight: 700 }}>YOUR OATH</div>
            <div style={{ fontFamily: "'Newsreader', serif", fontStyle: 'italic', fontSize: 22, fontWeight: 500, marginTop: 4 }}>
              {myVote
                ? <span>You voted <b style={{ color: myVote === 'yea' ? t.success : myVote === 'nay' ? t.gold : t.muted, fontFamily: "'Manrope'", fontStyle: 'normal', letterSpacing: '0.04em' }}>{myVote.toUpperCase()}</b> on §{a.id}.</span>
                : <span>Cast your oath on §{a.id}.</span>}
            </div>
            <p style={{ fontSize: 13, color: t.muted, marginTop: 8, maxWidth: 540, lineHeight: 1.5 }}>
              Your vote is sealed on chain and immutable. Voting weight equals 1 — every citizen, one oath.
            </p>
            <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
              {[
                { k: 'yea', l: 'Vote YEA', c: t.success },
                { k: 'nay', l: 'Vote NAY', c: t.gold },
                { k: 'abstain', l: 'Abstain', c: t.muted },
              ].map((b) => (
                <button key={b.k} onClick={() => cast(b.k)} style={{
                  padding: '12px 22px', borderRadius: 8, cursor: 'pointer',
                  background: myVote === b.k ? b.c : 'transparent',
                  color: myVote === b.k ? (b.c === t.muted ? t.fg : '#fff') : b.c,
                  border: `1px solid ${b.c}`,
                  fontFamily: 'inherit', fontWeight: 700, fontSize: 13, letterSpacing: '0.04em',
                }}>{b.l}</button>
              ))}
            </div>
          </div>
        </Card>

        {/* Discussion / dissent */}
        <Card style={{ padding: '24px 28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ fontFamily: "'Newsreader', serif", fontStyle: 'italic', fontSize: 22, fontWeight: 500 }}>Dissent on the floor</div>
            <div style={{ fontSize: 11, color: t.muted, fontFamily: "'JetBrains Mono', monospace" }}>312 SIGNED · 4 102 DISSENTING</div>
          </div>
          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { n: 'Citizen №00 471 · Tallinn', body: 'A 27% reduction is a 27% reduction. Operational quorum exists to protect the embassy from capture by a small subset of citizens. Defer.', y: 412 },
              { n: 'Citizen №02 980 · Lagos', body: 'The current threshold is calibrated for hemispheres that have had eighteen months of growth. The South has had two. Adjust the calibration, not the principle.', y: 308 },
              { n: 'Citizen №00 014 · Buenos Aires', body: 'Buenos Aires has 108 attestations on day one. Lagos took 91 days. We are not asking for less democracy — we are asking for less waiting.', y: 1490 },
            ].map((d, i) => (
              <div key={i} style={{ padding: '14px 16px', background: t.bg, border: `1px solid ${t.rule}`, borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: t.fg, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.04em' }}>{d.n}</span>
                  <span style={{ fontSize: 11, color: t.muted, fontFamily: "'JetBrains Mono', monospace" }}>↑ {d.y}</span>
                </div>
                <p style={{ fontSize: 14, color: t.fg, marginTop: 6, lineHeight: 1.55, fontFamily: "'Newsreader', serif" }}>{d.body}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
window.GovernanceScreen = GovernanceScreen;

// ─── TREASURY ──────────────────────────────────────────────────────────
function TreasuryScreen() {
  const t = useTokens();
  const [period, setPeriod] = useSGT('Q2');

  // Spark line points (60d treasury balance in $M)
  const sparkSeries = useMGT(() => {
    const pts = [];
    let v = 11.2;
    for (let i = 0; i < 60; i++) {
      v += (Math.sin(i / 4.3) * 0.18) + (i / 60) * 0.55 + (Math.random() - 0.5) * 0.08;
      pts.push(v);
    }
    pts[pts.length - 1] = 14.2;
    return pts;
  }, []);

  const W = 720, H = 180, PAD = 12;
  const minV = Math.min(...sparkSeries), maxV = Math.max(...sparkSeries);
  const x = (i) => PAD + (i / (sparkSeries.length - 1)) * (W - PAD * 2);
  const y = (v) => H - PAD - ((v - minV) / (maxV - minV)) * (H - PAD * 2);
  const sparkPath = sparkSeries.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const sparkArea = `${sparkPath} L ${x(sparkSeries.length - 1).toFixed(1)} ${H - PAD} L ${PAD} ${H - PAD} Z`;

  // Allocation segments
  const ALLOC = [
    { label: 'Embassy operations', pct: 38, dollars: '$5.40M', color: t.gold },
    { label: 'Validator rewards', pct: 22, dollars: '$3.12M', color: t.success },
    { label: 'Citizen grants', pct: 17, dollars: '$2.41M', color: '#7cffa6' },
    { label: 'Translation Council', pct: 9, dollars: '$1.28M', color: '#a8c0e4' },
    { label: 'General Reserve', pct: 14, dollars: '$1.99M', color: t.muted },
  ];

  return (
    <div style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Hero balance + spark */}
      <Card style={{ padding: '32px 36px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 24, alignItems: 'start' }}>
          <div>
            <div style={{ fontSize: 11, color: t.muted, letterSpacing: '0.12em', fontWeight: 700 }}>TREASURY · GENERAL RESERVE · BLOCK 21 408 932</div>
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'baseline', gap: 16 }}>
              <span style={{ fontSize: 72, fontWeight: 800, color: t.fg, letterSpacing: '-0.04em', lineHeight: 1, fontFamily: "'Manrope'" }}>$14.20M</span>
              <span style={{ fontSize: 18, color: t.success, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>+4.81%</span>
              <span style={{ fontSize: 12, color: t.muted, fontFamily: "'JetBrains Mono', monospace" }}>vs 60d ago</span>
            </div>
            <div style={{ marginTop: 6, fontSize: 14, color: t.muted, fontFamily: "'Newsreader', serif", fontStyle: 'italic' }}>
              14.2 million $CRYPT held in reserve · governed by every citizen.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {['30D', 'Q2', '1Y', 'ALL'].map((p) => (
              <button key={p} onClick={() => setPeriod(p)} style={{
                padding: '8px 14px', borderRadius: 999, cursor: 'pointer',
                background: period === p ? t.fg : 'transparent', color: period === p ? t.bg : t.fg,
                border: `1px solid ${period === p ? t.fg : t.rule}`,
                fontFamily: 'inherit', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
              }}>{p}</button>
            ))}
          </div>
        </div>

        {/* Spark */}
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ marginTop: 22, display: 'block' }}>
          <defs>
            <linearGradient id="trgrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={t.gold} stopOpacity="0.32" />
              <stop offset="100%" stopColor={t.gold} stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* y grid */}
          {[0.25, 0.5, 0.75].map((p) => (
            <line key={p} x1={PAD} x2={W - PAD} y1={H * p} y2={H * p} stroke={t.rule} strokeDasharray="2 4" />
          ))}
          <path d={sparkArea} fill="url(#trgrad)" />
          <path d={sparkPath} fill="none" stroke={t.gold} strokeWidth="1.6" />
          <circle cx={x(sparkSeries.length - 1)} cy={y(sparkSeries[sparkSeries.length - 1])} r="4" fill={t.gold} />
          {/* end label */}
          <text x={W - PAD} y={y(sparkSeries[sparkSeries.length - 1]) - 10} textAnchor="end" fontFamily="'JetBrains Mono', monospace" fontSize="11" fill={t.fg} fontWeight="700">$14.20M</text>
        </svg>
      </Card>

      {/* Allocation + your holdings */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20 }}>
        <Card style={{ padding: '24px 28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ fontFamily: "'Newsreader', serif", fontStyle: 'italic', fontSize: 22, fontWeight: 500 }}>Allocation by mandate</div>
            <Tag>RATIFIED · BLOCK 21 408 871</Tag>
          </div>

          {/* horizontal stacked bar */}
          <div style={{ marginTop: 18, height: 16, display: 'flex', borderRadius: 999, overflow: 'hidden', border: `1px solid ${t.rule}` }}>
            {ALLOC.map((a) => (
              <div key={a.label} style={{ width: `${a.pct}%`, background: a.color }} />
            ))}
          </div>
          <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ALLOC.map((a) => (
              <div key={a.label} style={{ display: 'grid', gridTemplateColumns: '14px 1fr 80px 90px', gap: 14, alignItems: 'center' }}>
                <div style={{ width: 14, height: 14, background: a.color, border: `1px solid ${t.rule}` }} />
                <span style={{ fontSize: 14, color: t.fg, fontWeight: 600 }}>{a.label}</span>
                <span style={{ fontSize: 14, color: t.fg, fontWeight: 700, textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>{a.pct}%</span>
                <span style={{ fontSize: 13, color: t.muted, textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>{a.dollars}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card style={{ padding: '24px 28px' }}>
          <div style={{ fontSize: 10, color: t.muted, letterSpacing: '0.12em', fontWeight: 700 }}>YOUR HOLDINGS</div>
          <div style={{ marginTop: 10, fontFamily: "'Manrope'", fontSize: 44, fontWeight: 800, color: t.gold, letterSpacing: '-0.02em', lineHeight: 1 }}>$2 480.00</div>
          <div style={{ fontSize: 13, color: t.muted, fontFamily: "'JetBrains Mono', monospace" }}>2 480 $CRYPT · staked 124</div>

          <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              ['Wallet', '2 356 $CRYPT'],
              ['Staked (Embassy LIS)', '124 $CRYPT'],
              ['Pending grants', '$0'],
              ['Voting weight', '1.00'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '8px 0', borderTop: `1px solid ${t.rule}` }}>
                <span style={{ color: t.muted }}>{k}</span>
                <span style={{ color: t.fg, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{v}</span>
              </div>
            ))}
          </div>
          <button style={{ marginTop: 18, width: '100%', padding: '12px 14px', borderRadius: 8, background: t.fg, color: t.bg, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 12, letterSpacing: '0.08em' }}>STAKE TO AN EMBASSY →</button>
        </Card>
      </div>

      {/* Disbursements ledger */}
      <Card style={{ padding: 0 }}>
        <div style={{ padding: '18px 22px', borderBottom: `1px solid ${t.rule}` }}>
          <div style={{ fontFamily: "'Newsreader', serif", fontStyle: 'italic', fontSize: 22, fontWeight: 500 }}>Disbursements · Q2 MMXXVI</div>
          <div style={{ fontSize: 12, color: t.muted, marginTop: 4 }}>All transfers ratified on chain · 47 entries this quarter</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '120px 130px 1fr 140px 110px', padding: '10px 22px', fontSize: 10, color: t.muted, letterSpacing: '0.12em', fontWeight: 700, borderBottom: `1px solid ${t.rule}` }}>
          <span>BLOCK</span><span>DATE</span><span>RECIPIENT / MANDATE</span><span style={{ textAlign: 'right' }}>AMOUNT</span><span style={{ textAlign: 'right' }}>STATUS</span>
        </div>
        {[
          ['21 408 871', '2026.05.11', 'Embassy Tallinn · Q2 operations', '$148 200', 'EXECUTED', t.success],
          ['21 408 042', '2026.05.10', 'Translation Council · stipend',  '$42 800',  'EXECUTED', t.success],
          ['21 407 880', '2026.05.09', 'Citizen №02 091 · founder grant', '$25 000',  'EXECUTED', t.success],
          ['21 407 211', '2026.05.08', 'Embassy Lagos · venue extension', '$74 400',  'PENDING',  t.gold],
          ['21 406 902', '2026.05.07', 'Validator slot 14 · monthly',     '$18 200',  'EXECUTED', t.success],
          ['21 406 240', '2026.05.06', 'Embassy Buenos Aires · fit-out',  '$148 200', 'PROPOSED', t.muted],
        ].map((row, i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '120px 130px 1fr 140px 110px',
            padding: '14px 22px', borderBottom: i === 5 ? 'none' : `1px solid ${t.rule}`,
            fontSize: 13, alignItems: 'center',
          }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: t.muted }}>{row[0]}</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: t.muted }}>{row[1]}</span>
            <span style={{ color: t.fg, fontWeight: 500 }}>{row[2]}</span>
            <span style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", color: t.fg, fontWeight: 700 }}>{row[3]}</span>
            <span style={{ textAlign: 'right' }}><Tag fg={row[5]} border={row[5]}>{row[4]}</Tag></span>
          </div>
        ))}
      </Card>
    </div>
  );
}
window.TreasuryScreen = TreasuryScreen;
