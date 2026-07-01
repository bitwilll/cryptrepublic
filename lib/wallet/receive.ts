import "client-only";
import QRCode from "qrcode";

/**
 * Receive = show the public address + a QR code. The QR is a self-contained
 * `data:image/png;base64,...` URL (no network fetch), which the CSP allows via
 * `img-src 'self' data:`.
 */
export function receiveQrDataUrl(address: string): Promise<string> {
  return QRCode.toDataURL(address, { margin: 1, width: 240 });
}
