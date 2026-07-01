import "server-only";
import { hash, verify } from "@node-rs/argon2";

// Argon2id params — spec §4.3. memoryCost is KiB; 65536 KiB = 64 MiB.
const OPTIONS = { memoryCost: 65536, timeCost: 3, parallelism: 1, outputLen: 32 } as const;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(passwordHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(passwordHash, plain);
  } catch {
    return false;
  }
}

// Precomputed valid $argon2id$ hash of a random secret nobody will submit — used to
// equalize login timing when the email is unknown (enumeration resistance, spec §4.4).
// Generated locally with @node-rs/argon2 using the same params as OPTIONS. It is a REAL
// hash (not a placeholder): the raw verify(DUMMY_HASH, x) must RESOLVE false (slow), never
// THROW (fast), so it does not re-open the enumeration timing side-channel.
export const DUMMY_HASH =
  "$argon2id$v=19$m=65536,t=3,p=1$a0s53BwRsM/elgBeMzBtwA$ihJ+xWebrnzoCHV5NCECFsyoJrtrRwkfFhD3th/cDIA";
