import type { Metadata } from "next";
import { CertificatesApp } from "@/components/certificates/CertificatesApp";
import styles from "@/components/certificates/certificates.module.css";

export const metadata: Metadata = {
  title: "Certificates — CryptRepublic",
  description:
    "Sign messages and documents with your sovereign wallet. Certificates carry a public serial and can be verified by anyone, without an account.",
};

/**
 * Signing message & certificate (Wave 15 — Identity). Server shell mounting
 * the client island. All signing happens CLIENT-SIDE with the citizen's own
 * wallet; the Republic stores only the public record (serial, title, subject
 * or file name, content hash, signer address, signature).
 */
export default function CertificatesPage() {
  return (
    <div className={`wrap ${styles.stack}`}>
      <div>
        <div className="kicker">SIGNING MESSAGE &amp; CERTIFICATE</div>
        <h1 style={{ marginTop: 10 }}>Certificates</h1>
        <p style={{ color: "var(--muted)", marginTop: 8, maxWidth: 560 }}>
          Attest and certify statements under your own seal. Your wallet signs locally; the Republic
          records only the public certificate — anyone can verify it at /verify, no account
          required.
        </p>
      </div>
      <CertificatesApp />
    </div>
  );
}
