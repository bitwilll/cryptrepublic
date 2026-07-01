// Single home for the injected-provider type. Wave 3 (wagmi) may replace/extend this file.
export {};
declare global {
  interface Window {
    ethereum?: {
      request(args: { method: string; params?: unknown[] }): Promise<unknown>;
      on?(event: string, handler: (...args: unknown[]) => void): void;
    };
  }
}
