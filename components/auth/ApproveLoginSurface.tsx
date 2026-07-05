"use client";
import { useState } from "react";
import { isUnlocked, unlock } from "@/lib/wallet/embedded/session";
import { UnlockWalletModal } from "@/components/wallet/UnlockWalletModal";
import { QrLoginApprove } from "@/components/auth/QrLoginApprove";

/**
 * Device-B approve surface: the unlock gate + QrLoginApprove. Lives under
 * components/ (not the app/ route file) so it may import the client-only
 * lib/wallet vault — the same boundary WalletApp/VerifyWalletCard use.
 * `requireUnlock` prompts an unlock when the vault is locked and returns false;
 * the user re-approves once unlocked (mirrors VerifyWalletCard's contract).
 */
export function ApproveLoginSurface(): React.ReactElement {
  const [showUnlock, setShowUnlock] = useState(false);

  function requireUnlock(): boolean {
    if (isUnlocked()) return true;
    setShowUnlock(true);
    return false;
  }
  async function onUnlock(pass: string) {
    await unlock(pass);
    setShowUnlock(false);
  }

  return (
    <>
      <QrLoginApprove requireUnlock={requireUnlock} />
      {showUnlock && (
        <UnlockWalletModal onUnlock={onUnlock} onCancel={() => setShowUnlock(false)} />
      )}
    </>
  );
}
