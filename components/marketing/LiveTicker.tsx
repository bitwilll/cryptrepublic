const ITEMS = [
  "CITIZEN №48 392 INDUCTED — BUENOS AIRES",
  "AMENDMENT §47 IN DEBATE — 13 421 YEA",
  "Q2 DIVIDEND $138.50 / CITIZEN — CLAIMABLE",
  "TREASURY $14.2M — +4.81% / 60D",
  "EMBASSY BUENOS AIRES REACHED QUORUM",
  "BLOCK 21 408 932 SEALED — 8.0s",
];

export function LiveTicker() {
  // Duplicate the track content for a seamless marquee loop (Home.html did this
  // with `track.innerHTML += track.innerHTML`).
  const items = [...ITEMS, ...ITEMS];
  return (
    <div className="ticker" aria-hidden="true">
      <div className="ticker-track" id="tickerTrack">
        {items.map((text, i) => (
          <span key={i}>
            <i>●</i> {text}
          </span>
        ))}
      </div>
    </div>
  );
}
