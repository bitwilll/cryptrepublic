"use client";
import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

/**
 * Camera QR scanner (Wave 11 C3) — bundled pure-JS jsQR (no CDN, no WASM, no
 * worker → zero CSP change). getUserMedia runs ONLY on the explicit "Scan"
 * tap (Constraint #5); permission-denied / no-camera degrade to an inline
 * error + a manual-paste fallback (also reachable up-front); every MediaStream
 * track is stopped on decode, close, and unmount — no dangling camera.
 */
export function QrScanner({
  label,
  onResult,
  onCancel,
}: {
  label: string;
  onResult: (text: string) => void;
  onCancel?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPaste, setShowPaste] = useState(false);
  const [pasted, setPasted] = useState("");

  function stopStream() {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }

  // No dangling camera on unmount.
  useEffect(() => stopStream, []);

  async function startScan() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("No camera is available on this device — paste the code text instead.");
      setShowPaste(true);
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
    } catch {
      setError("Camera unavailable or permission denied — paste the code text instead.");
      setShowPaste(true);
      return;
    }
    streamRef.current = stream;
    setScanning(true);
    const video = videoRef.current;
    if (!video) {
      stopStream();
      return;
    }
    video.srcObject = stream;
    try {
      await video.play();
    } catch {
      /* jsdom / autoplay quirks — the frame loop below still gates on readiness */
    }
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      stopStream();
      setError("Could not read camera frames — paste the code text instead.");
      setShowPaste(true);
      return;
    }
    const tick = () => {
      if (!streamRef.current) return;
      if (video.readyState >= 2 && video.videoWidth > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(img.data, img.width, img.height);
        if (code?.data) {
          stopStream();
          onResult(code.data);
          return;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  function submitPaste(e: React.FormEvent) {
    e.preventDefault();
    const text = pasted.trim();
    if (!text) return;
    setPasted("");
    onResult(text);
  }

  return (
    <div data-testid="qr-scanner">
      <p style={{ margin: 0, fontSize: 13 }}>{label}</p>
      <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
        {!scanning && (
          <button
            className="btn btn-primary"
            type="button"
            data-testid="scan-start"
            onClick={startScan}
          >
            Scan with camera
          </button>
        )}
        {scanning && (
          <button className="btn" type="button" data-testid="scan-stop" onClick={stopStream}>
            Stop camera
          </button>
        )}
        {!showPaste && (
          <button
            className="btn"
            type="button"
            data-testid="paste-instead"
            onClick={() => setShowPaste(true)}
          >
            Paste instead
          </button>
        )}
        {onCancel && (
          <button className="btn" type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      {/* Live camera preview (muted, no audio track — captions not applicable). */}
      <video
        ref={videoRef}
        data-testid="scan-video"
        playsInline
        muted
        style={{
          display: scanning ? "block" : "none",
          width: "100%",
          maxWidth: 420,
          marginTop: 12,
          border: "1px solid var(--line)",
        }}
      />
      {error && (
        <p role="alert" style={{ color: "#8b3a3a", marginTop: 10, fontSize: 13 }}>
          {error}
        </p>
      )}
      {showPaste && (
        <form onSubmit={submitPaste} style={{ marginTop: 12 }}>
          <label htmlFor="qr-paste" style={{ display: "block", marginBottom: 6, fontSize: 12 }}>
            Paste the code text
          </label>
          <textarea
            id="qr-paste"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={3}
            autoComplete="off"
            spellCheck={false}
            data-testid="qr-paste-input"
            style={{
              width: "100%",
              maxWidth: 560,
              padding: 10,
              border: "1px solid var(--line)",
              borderRadius: 8,
              fontFamily: "var(--mono, monospace)",
              fontSize: 12,
            }}
          />
          <div style={{ marginTop: 8 }}>
            <button className="btn" type="submit" data-testid="qr-paste-submit">
              Use pasted text
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
