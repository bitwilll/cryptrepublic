"use client";
import Link from "next/link";
import styles from "../mint.module.css";
import { Button } from "@/components/ui/Button";

export function MintSealedReceipt({
  tokenId,
  txHash,
  explorer,
}: {
  tokenId: string;
  txHash?: string;
  explorer?: string;
}): React.ReactElement {
  const explorerUrl = explorer && txHash ? `${explorer}/tx/${txHash}` : undefined;
  return (
    <div className={styles.receipt}>
      <span className={`${styles.tag} ${styles.tagSuccess}`}>✓ SEALED</span>
      <h2 className={styles.receiptHeading}>Welcome to CryptRepublic, Citizen №{tokenId}.</h2>
      <p className={styles.lede} style={{ marginLeft: "auto", marginRight: "auto" }}>
        Your passport is sealed in perpetuity. It cannot be sold, transferred, or revoked. The
        Republic recognises you in time.
      </p>
      {explorerUrl ? (
        <p style={{ marginTop: 12 }}>
          <a href={explorerUrl} target="_blank" rel="noreferrer" className={styles.sealingCaption}>
            VIEW TRANSACTION ↗
          </a>
        </p>
      ) : null}
      <div className={styles.receiptActions}>
        <Button as="a" variant="dark" href="/dashboard">
          ENTER THE REPUBLIC →
        </Button>
        <Link className="btn btn-ghost" href="/dashboard/passport">
          VIEW MY PASSPORT
        </Link>
      </div>
    </div>
  );
}
