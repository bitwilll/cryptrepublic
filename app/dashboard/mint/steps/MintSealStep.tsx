"use client";
import styles from "../mint.module.css";
import { SealingAnimation } from "../components/SealingAnimation";

export type SealState = "idle" | "pending" | "mined" | "error";

export function MintSealStep({ state }: { state: SealState }): React.ReactElement {
  return (
    <div className={styles.sealing}>
      <span className={styles.tag}>STEP 04 OF 04 · SEALING</span>
      <SealingAnimation />
      <h2 className={styles.heading} style={{ textAlign: "center", maxWidth: 480 }}>
        {state === "pending" ? "Sealing your passport on chain…" : "Ready to seal your passport."}
      </h2>
      <div className={styles.sealingCaption}>
        {state === "pending" ? "AWAITING BLOCK" : "SIGN WITH YOUR OWN WALLET"}
      </div>
    </div>
  );
}
