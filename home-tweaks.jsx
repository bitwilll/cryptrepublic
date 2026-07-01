// Home.html hero-gradient tweaks — mounts a Tweaks panel into the vanilla page
// and drives the hero background via CSS variables. Default = bitwill-style warm
// gold glow over a clean light base.

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "heroGlowColor": "#e8b465",
  "heroAccentColor": "#1957d3",
  "heroBase": "#f6f7f9",
  "heroIntensity": 0.6,
  "heroGlowPos": "top",
  "heroGrid": false
}/*EDITMODE-END*/;

function hexToRgba(hex, a) {
  let h = String(hex || '#000').replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const HERO_POS = { top: '50% -12%', center: '50% 32%', corner: '88% -8%' };

function buildHeroBg(t) {
  const k = Math.max(0, Math.min(1, t.heroIntensity));
  const a1 = (k * 0.42).toFixed(3);
  const a2 = (k * 0.20).toFixed(3);
  const layers = [];
  if (t.heroGrid) {
    layers.push('repeating-linear-gradient(0deg, rgba(10,25,41,.045) 0 1px, transparent 1px 64px)');
    layers.push('repeating-linear-gradient(90deg, rgba(10,25,41,.045) 0 1px, transparent 1px 64px)');
  }
  layers.push(`radial-gradient(1100px 660px at ${HERO_POS[t.heroGlowPos] || HERO_POS.top}, ${hexToRgba(t.heroGlowColor, a1)}, transparent 62%)`);
  layers.push(`radial-gradient(780px 480px at -8% 112%, ${hexToRgba(t.heroAccentColor, a2)}, transparent 60%)`);
  return layers.join(',');
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  React.useEffect(() => {
    const hero = document.querySelector('.hero');
    if (!hero) return;
    hero.style.setProperty('--hero-base', t.heroBase);
    hero.style.setProperty('--hero-bg-image', buildHeroBg(t));
  }, [t]);

  return (
    <TweaksPanel title="Tweaks">
      <TweakSection label="Hero gradient" />
      <TweakColor label="Glow color" value={t.heroGlowColor}
        options={['#e8b465', '#f7931a', '#c8a96a', '#1957d3', '#00b3e6']}
        onChange={(v) => setTweak('heroGlowColor', v)} />
      <TweakColor label="Accent color" value={t.heroAccentColor}
        options={['#1957d3', '#0e3a9b', '#c8a96a', '#00b3e6', '#9d8246']}
        onChange={(v) => setTweak('heroAccentColor', v)} />
      <TweakSlider label="Glow intensity" value={t.heroIntensity} min={0} max={1} step={0.05}
        onChange={(v) => setTweak('heroIntensity', v)} />
      <TweakRadio label="Glow position" value={t.heroGlowPos}
        options={['top', 'center', 'corner']}
        onChange={(v) => setTweak('heroGlowPos', v)} />
      <TweakSection label="Background" />
      <TweakColor label="Base" value={t.heroBase}
        options={['#f6f7f9', '#ffffff', '#f4efe6', '#0a1929']}
        onChange={(v) => setTweak('heroBase', v)} />
      <TweakToggle label="Grid overlay" value={t.heroGrid}
        onChange={(v) => setTweak('heroGrid', v)} />
    </TweaksPanel>
  );
}

ReactDOM.createRoot(document.getElementById('tweaks-root')).render(<App />);
