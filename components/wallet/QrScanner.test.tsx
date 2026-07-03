// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * QrScanner (Wave 11 C3). Camera decode path (mocked getUserMedia + stubbed
 * jsQR), permission-denied → inline error + paste fallback, no-mediaDevices →
 * paste fallback without ever calling getUserMedia, and track cleanup on
 * unmount (Constraint #5 — no dangling camera).
 */

const h = vi.hoisted(() => ({
  qrData: null as string | null,
}));

vi.mock("jsqr", () => ({
  default: vi.fn(() => (h.qrData ? { data: h.qrData } : null)),
}));

import { QrScanner } from "./QrScanner";

const trackStop = vi.fn();
const fakeStream = { getTracks: () => [{ stop: trackStop }] } as unknown as MediaStream;
let getUserMedia: ReturnType<typeof vi.fn>;
const originalMediaDevices = navigator.mediaDevices;

function setMediaDevices(value: unknown) {
  Object.defineProperty(navigator, "mediaDevices", { value, configurable: true });
}

beforeEach(() => {
  h.qrData = null;
  trackStop.mockClear();
  getUserMedia = vi.fn(async () => fakeStream);
  setMediaDevices({ getUserMedia });
  // jsdom stubs: playable video with a ready frame + a readable 2d context.
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    value: vi.fn(async () => {}),
    configurable: true,
  });
  Object.defineProperty(HTMLMediaElement.prototype, "readyState", {
    value: 4,
    configurable: true,
  });
  Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
    value: 2,
    configurable: true,
  });
  Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
    value: 2,
    configurable: true,
  });
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    value: vi.fn(() => ({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(16), width: 2, height: 2 })),
    })),
    configurable: true,
  });
});

afterEach(() => {
  setMediaDevices(originalMediaDevices);
});

describe("QrScanner", () => {
  it("does NOT touch the camera before the explicit Scan tap", () => {
    render(<QrScanner label="Scan the code" onResult={() => {}} />);
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("camera decode: Scan tap → getUserMedia → jsQR hit → onResult + tracks stopped", async () => {
    h.qrData = "envelope-payload";
    const onResult = vi.fn();
    render(<QrScanner label="Scan the code" onResult={onResult} />);
    fireEvent.click(screen.getByTestId("scan-start"));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith("envelope-payload"));
    expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: "environment" } });
    expect(trackStop).toHaveBeenCalled();
  });

  it("permission denied → inline error + the paste fallback appears", async () => {
    getUserMedia.mockRejectedValueOnce(
      Object.assign(new Error("denied"), { name: "NotAllowedError" }),
    );
    render(<QrScanner label="Scan the code" onResult={() => {}} />);
    fireEvent.click(screen.getByTestId("scan-start"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/denied|unavailable/i));
    expect(screen.getByTestId("qr-paste-input")).toBeInTheDocument();
  });

  it("no mediaDevices at all → paste fallback WITHOUT ever calling getUserMedia", async () => {
    setMediaDevices(undefined);
    const onResult = vi.fn();
    render(<QrScanner label="Scan the code" onResult={onResult} />);
    fireEvent.click(screen.getByTestId("scan-start"));
    await waitFor(() => expect(screen.getByTestId("qr-paste-input")).toBeInTheDocument());
    fireEvent.change(screen.getByTestId("qr-paste-input"), {
      target: { value: "  pasted-payload  " },
    });
    fireEvent.click(screen.getByTestId("qr-paste-submit"));
    expect(onResult).toHaveBeenCalledWith("pasted-payload");
  });

  it("'Paste instead' is available up-front (degrades with no camera at all)", () => {
    const onResult = vi.fn();
    render(<QrScanner label="Scan the code" onResult={onResult} />);
    fireEvent.click(screen.getByTestId("paste-instead"));
    fireEvent.change(screen.getByTestId("qr-paste-input"), { target: { value: "abc" } });
    fireEvent.click(screen.getByTestId("qr-paste-submit"));
    expect(onResult).toHaveBeenCalledWith("abc");
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("unmount mid-scan stops every track (no dangling camera)", async () => {
    h.qrData = null; // never decodes — the loop keeps running
    const { unmount } = render(<QrScanner label="Scan the code" onResult={() => {}} />);
    fireEvent.click(screen.getByTestId("scan-start"));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId("scan-stop")).toBeInTheDocument());
    unmount();
    expect(trackStop).toHaveBeenCalled();
  });
});
