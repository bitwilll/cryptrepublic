import { issueNonce } from "@/lib/auth/siwe";
import { json } from "@/lib/http/responses";

export async function GET(): Promise<Response> {
  return json({ nonce: await issueNonce() });
}
