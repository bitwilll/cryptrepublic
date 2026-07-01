// dash-mint.jsx — Mint Passport onboarding flow (4 steps + sealed receipt)
const { useState: useSM, useEffect: useEM } = React;

function MintScreen({ onComplete }) {
  const t = useTokens();
  const [step, setStep] = useSM(0);
  const [form, setForm] = useSM({
    name: '', city: 'Lisbon', country: 'Portugal',
    motto: '',
    accepted: false, oath: false,
    sealing: false, sealed: false,
    newCitizenNo: '',
  });

  const STEPS = ['Attest', 'Oath', 'Witness', 'Seal'];

  useEM(() => {
    if (step === 3 && !form.sealed && !form.sealing) {
      setForm(f => ({ ...f, sealing: true }));
      const t1 = setTimeout(() => {
        const num = '0' + (48392 + Math.floor(Math.random() * 7) + 1).toString();
        setForm(f => ({ ...f, sealing: false, sealed: true, newCitizenNo: num.slice(-5) }));
      }, 2800);
      return () => clearTimeout(t1);
    }
  }, [step, form.sealing, form.sealed]);

  function canAdvance() {
    if (step === 0) return form.name.trim().length > 2 && form.city.trim().length > 1;
    if (step === 1) return form.accepted && form.motto.trim().length > 4;
    if (step === 2) return form.oath;
    return false;
  }

  return (
    <div style={{ padding: 32, display: 'grid', gridTemplateColumns: '1fr 360px', gap: 32, minHeight: 'calc(100vh - 84px)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <Card style={{ padding: '28px 32px' }}>
          {/* Stepper */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {STEPS.map((s, i) => (
              <React.Fragment key={s}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: '50%',
                    background: i < step || form.sealed ? t.success : i === step ? t.gold : 'transparent',
                    color: i <= step || form.sealed ? '#fff' : t.muted,
                    border: `1px solid ${i <= step || form.sealed ? 'transparent' : t.rule}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 12,
                  }}>{i < step || (form.sealed && i === step) ? '✓' : `0${i + 1}`}</div>
                  <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', color: i === step ? t.fg : t.muted }}>{s.toUpperCase()}</span>
                </div>
                {i < STEPS.length - 1 && <div style={{ flex: 1, height: 1, background: i < step ? t.success : t.rule }} />}
              </React.Fragment>
            ))}
          </div>

          {/* Step content */}
          <div style={{ marginTop: 28 }}>
            {step === 0 && (
              <div>
                <Tag fg={t.gold} border={t.gold}>STEP 01 OF 04 · ~3 MINUTES</Tag>
                <h2 style={{ margin: '12px 0 0', fontFamily: "'Newsreader', serif", fontStyle: 'italic', fontSize: 42, fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1.05 }}>
                  Attest who you are.
                </h2>
                <p style={{ fontSize: 15, color: t.muted, lineHeight: 1.6, marginTop: 12, maxWidth: 560 }}>
                  Your name and place will be inscribed on your passport in perpetuity. You may not change them. Citizens of the Republic stand by what they have written.
                </p>
                <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, maxWidth: 640 }}>
                  <FormField t={t} label="LEGAL OR CHOSEN NAME">
                    <input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="A. Nakadai" style={inputS(t)} />
                  </FormField>
                  <FormField t={t} label="DOMICILE CITY">
                    <input value={form.city} onChange={(e) => setForm(f => ({ ...f, city: e.target.value }))} style={inputS(t)} />
                  </FormField>
                  <FormField t={t} label="HOST COUNTRY">
                    <input value={form.country} onChange={(e) => setForm(f => ({ ...f, country: e.target.value }))} style={inputS(t)} />
                  </FormField>
                  <FormField t={t} label="DATE OF BINDING">
                    <input disabled value="2026.05.11 · today" style={{ ...inputS(t), opacity: 0.6 }} />
                  </FormField>
                </div>
              </div>
            )}

            {step === 1 && (
              <div>
                <Tag fg={t.gold} border={t.gold}>STEP 02 OF 04 · BIND YOUR OATH</Tag>
                <h2 style={{ margin: '12px 0 0', fontFamily: "'Newsreader', serif", fontStyle: 'italic', fontSize: 42, fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1.05 }}>
                  The oath of entry.
                </h2>
                <div style={{ marginTop: 18, padding: '22px 24px', background: t.bg, border: `1px solid ${t.rule}`, borderRadius: 8, fontFamily: "'Newsreader', serif", fontStyle: 'italic', fontSize: 18, color: t.fg, lineHeight: 1.7, maxWidth: 720 }}>
                  "I, the undersigned, freely seek citizenship of CryptRepublic. I will vote on every matter brought before the Republic, will attest only what I have witnessed, will respect every other citizen as my equal, and will hold no allegiance higher than my conscience. So sealed, so sworn."
                </div>
                <FormField t={t} label="A PERSONAL MOTTO (to be inscribed on your passport)" style={{ marginTop: 22, maxWidth: 560 }}>
                  <input value={form.motto} onChange={(e) => setForm(f => ({ ...f, motto: e.target.value }))} placeholder="e.g. Recognized in time." style={inputS(t)} />
                </FormField>
                <label style={{ marginTop: 22, display: 'flex', gap: 12, alignItems: 'start', cursor: 'pointer', maxWidth: 640 }}>
                  <input type="checkbox" checked={form.accepted} onChange={(e) => setForm(f => ({ ...f, accepted: e.target.checked }))} style={{ marginTop: 2, accentColor: t.gold, width: 16, height: 16 }} />
                  <span style={{ fontSize: 14, color: t.fg, lineHeight: 1.55 }}>
                    I accept the Constitution of the Republic in its current form (ratified MMXXVI), and acknowledge that my passport, once sealed, cannot be sold, transferred, or revoked.
                  </span>
                </label>
              </div>
            )}

            {step === 2 && (
              <div>
                <Tag fg={t.gold} border={t.gold}>STEP 03 OF 04 · WITNESS</Tag>
                <h2 style={{ margin: '12px 0 0', fontFamily: "'Newsreader', serif", fontStyle: 'italic', fontSize: 42, fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1.05 }}>
                  Seven witnesses, signing.
                </h2>
                <p style={{ fontSize: 15, color: t.muted, lineHeight: 1.6, marginTop: 12, maxWidth: 560 }}>
                  Seven citizens of three years' standing are attesting your induction. Their signatures will be bound to your passport in perpetuity.
                </p>
                <div style={{ marginTop: 22, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10 }}>
                  {[
                    ['№00 014', 'JM B'],
                    ['№00 471', 'M S'],
                    ['№01 482', 'CS'],
                    ['№02 117', 'GK'],
                    ['№02 980', 'AA'],
                    ['№03 408', 'PA'],
                    ['№04 102', 'TO'],
                  ].map(([n, ini], i) => (
                    <WitnessTile key={n} t={t} num={n} ini={ini} delay={i * 220} />
                  ))}
                </div>
                <label style={{ marginTop: 28, display: 'flex', gap: 12, alignItems: 'start', cursor: 'pointer', maxWidth: 640 }}>
                  <input type="checkbox" checked={form.oath} onChange={(e) => setForm(f => ({ ...f, oath: e.target.checked }))} style={{ marginTop: 2, accentColor: t.gold, width: 16, height: 16 }} />
                  <span style={{ fontSize: 14, color: t.fg, lineHeight: 1.55 }}>
                    I have read and accept the signatures of my witnesses. I am ready to be sealed.
                  </span>
                </label>
              </div>
            )}

            {step === 3 && !form.sealed && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, padding: '40px 0' }}>
                <Tag fg={t.gold} border={t.gold}>STEP 04 OF 04 · SEALING</Tag>
                <SealingAnimation t={t} />
                <h2 style={{ margin: 0, fontFamily: "'Newsreader', serif", fontStyle: 'italic', fontSize: 36, fontWeight: 500, letterSpacing: '-0.02em', textAlign: 'center', maxWidth: 480 }}>
                  Sealing your passport on chain…
                </h2>
                <div style={{ fontSize: 13, color: t.muted, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.04em' }}>
                  AWAITING BLOCK · ~ 8 SECONDS
                </div>
              </div>
            )}

            {step === 3 && form.sealed && (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <Tag fg={t.success} border={t.success}>✓ SEALED · BLOCK 21 408 932</Tag>
                <h2 style={{ margin: '14px auto 0', fontFamily: "'Newsreader', serif", fontStyle: 'italic', fontSize: 48, fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1.05, maxWidth: 640 }}>
                  Welcome to CryptRepublic, Citizen №{form.newCitizenNo}.
                </h2>
                <p style={{ fontSize: 15, color: t.muted, lineHeight: 1.6, marginTop: 14, maxWidth: 560, marginLeft: 'auto', marginRight: 'auto' }}>
                  Your passport is sealed in perpetuity. Voting power activates within 72 hours. The Republic recognises you in time.
                </p>
                <div style={{ marginTop: 28, display: 'inline-flex', gap: 12 }}>
                  <button onClick={() => onComplete && onComplete(form.newCitizenNo)} style={{ padding: '14px 24px', borderRadius: 999, background: t.fg, color: t.bg, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, letterSpacing: '0.06em' }}>ENTER THE REPUBLIC →</button>
                  <button onClick={() => onComplete && onComplete(form.newCitizenNo)} style={{ padding: '14px 24px', borderRadius: 999, background: 'transparent', color: t.fg, border: `1px solid ${t.rule}`, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, letterSpacing: '0.06em' }}>VIEW MY PASSPORT</button>
                </div>
              </div>
            )}
          </div>

          {/* Nav buttons */}
          {step < 3 && (
            <div style={{ marginTop: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 24, borderTop: `1px solid ${t.rule}` }}>
              <button disabled={step === 0} onClick={() => setStep(s => s - 1)} style={{
                padding: '11px 20px', borderRadius: 8,
                background: 'transparent', color: step === 0 ? t.muted : t.fg,
                border: `1px solid ${t.rule}`, cursor: step === 0 ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', fontWeight: 700, fontSize: 12, letterSpacing: '0.06em',
                opacity: step === 0 ? 0.5 : 1,
              }}>← BACK</button>
              <div style={{ fontSize: 11, color: t.muted, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.04em' }}>
                STEP {step + 1} / 4
              </div>
              <button disabled={!canAdvance()} onClick={() => setStep(s => s + 1)} style={{
                padding: '11px 24px', borderRadius: 8,
                background: canAdvance() ? t.gold : t.rule,
                color: canAdvance() ? '#fff' : t.muted,
                border: 'none', cursor: canAdvance() ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit', fontWeight: 700, fontSize: 12, letterSpacing: '0.06em',
              }}>{step === 2 ? 'SEAL MY PASSPORT' : 'CONTINUE'} →</button>
            </div>
          )}
        </Card>

        {/* Constitution preamble teaser */}
        {step < 3 && (
          <Card style={{ padding: '20px 24px', background: t.bg }}>
            <div style={{ fontSize: 10, color: t.muted, letterSpacing: '0.12em', fontWeight: 700 }}>FROM THE PREAMBLE OF THE CONSTITUTION</div>
            <p style={{ marginTop: 10, fontFamily: "'Newsreader', serif", fontStyle: 'italic', fontSize: 18, color: t.fg, lineHeight: 1.55, maxWidth: 700 }}>
              "We the citizens, having no shared soil, no shared blood, no shared past — but a shared chain — do hereby ratify, before time and before each other, this Republic."
            </p>
          </Card>
        )}
      </div>

      {/* RIGHT: live passport preview */}
      <aside style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 24, alignSelf: 'start' }}>
        <div style={{ fontSize: 10, color: t.muted, letterSpacing: '0.12em', fontWeight: 700 }}>YOUR PASSPORT · DRAFT</div>
        <div style={{ padding: 16, background: t.cardBg, border: `1px solid ${t.rule}`, borderRadius: 10 }}>
          <PassportPreview
            no={form.sealed ? form.newCitizenNo : '— — — —'}
            name={form.name ? form.name.toUpperCase() : 'YOUR NAME'}
            issued={form.sealed ? 'BLK 21 408 932' : 'AWAITING SEAL'}
            dense
          />
        </div>
        <div style={{ fontSize: 12, color: t.muted, lineHeight: 1.55, padding: '0 4px' }}>
          The passport updates as you fill in your attestation. Once sealed, it is permanent.
        </div>
      </aside>
    </div>
  );
}

function FormField({ label, children, t, style }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, ...style }}>
      <span style={{ fontSize: 10, color: t.muted, letterSpacing: '0.12em', fontWeight: 700 }}>{label}</span>
      {children}
    </label>
  );
}
function inputS(t) {
  return {
    padding: '12px 14px', border: `1px solid ${t.rule}`, borderRadius: 6,
    background: t.bg, color: t.fg, fontFamily: "'Manrope', sans-serif",
    fontSize: 15, outline: 'none', width: '100%',
  };
}

function WitnessTile({ t, num, ini, delay }) {
  const [signed, setSigned] = useSM(false);
  useEM(() => {
    const id = setTimeout(() => setSigned(true), delay + 200);
    return () => clearTimeout(id);
  }, [delay]);
  return (
    <div style={{
      padding: '12px 8px', background: signed ? t.selectedBg : t.bg,
      border: `1px solid ${signed ? t.success : t.rule}`,
      borderRadius: 8, textAlign: 'center', transition: 'all .4s',
    }}>
      <div style={{ width: 32, height: 32, margin: '0 auto', borderRadius: '50%', background: signed ? t.success : t.rule, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>{signed ? '✓' : ini}</div>
      <div style={{ fontSize: 10, color: t.fg, fontFamily: "'JetBrains Mono', monospace", marginTop: 6, fontWeight: 700 }}>{num}</div>
      <div style={{ fontSize: 9, color: signed ? t.success : t.muted, marginTop: 2, fontWeight: 700, letterSpacing: '0.06em' }}>{signed ? 'SIGNED' : 'WAITING'}</div>
    </div>
  );
}

function SealingAnimation({ t }) {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120">
      <style>{`
        @keyframes cr-spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
        @keyframes cr-pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
        .cr-ring { transform-origin: 60px 60px; animation: cr-spin 4s linear infinite; }
        .cr-ring-r { animation: cr-spin 6s linear infinite reverse; transform-origin: 60px 60px; }
        .cr-pulse { animation: cr-pulse 1.4s ease-in-out infinite; }
      `}</style>
      <circle cx="60" cy="60" r="54" fill="none" stroke={t.rule} strokeWidth="1" />
      <g className="cr-ring">
        <circle cx="60" cy="60" r="48" fill="none" stroke={t.gold} strokeWidth="1.4" strokeDasharray="4 8" />
      </g>
      <g className="cr-ring-r">
        <circle cx="60" cy="60" r="38" fill="none" stroke={t.gold} strokeWidth="1" strokeDasharray="2 5" opacity="0.6" />
      </g>
      <g className="cr-pulse">
        <polygon points="60,30 84,42 84,78 60,90 36,78 36,42" fill="none" stroke={t.gold} strokeWidth="1.6" />
      </g>
      <text x="60" y="68" textAnchor="middle" fontFamily="'Newsreader', serif" fontSize="28" fill={t.gold}>CR</text>
    </svg>
  );
}

window.MintScreen = MintScreen;
