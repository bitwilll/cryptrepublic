// @vitest-environment node
import { describe, it, expect, afterAll } from "vitest";
import { getAddress, pad, toHex } from "viem";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { nameHashOf } from "@/lib/passport/attestation";
import { GET } from "./route";

const APP = "http://localhost:3000";
const ids: string[] = [];

let c = 100;
function addr(): string {
  return getAddress(pad(toHex(c++), { size: 20 }));
}

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe("GET /api/applications/witnesses", () => {
  it("401 without a session", async () => {
    const res = await GET(new Request(APP + "/api/applications/witnesses"));
    expect(res.status).toBe(401);
  });

  it("returns collected sigs + applicant + nameHash for exact seal reconstruction", async () => {
    const applicant = addr();
    const w1 = addr();
    const w2 = addr();
    const user = await prisma.user.create({
      data: {
        email: `wget${Date.now()}@ex.org`,
        application: {
          create: {
            status: "WITNESSED",
            name: "A. Nakadai",
            applicantAddress: applicant,
            witnessNonce: "4",
            witnessDeadline: "1800000000",
            witnessSignatures: {
              create: [
                {
                  witnessAddress: w1,
                  signature: "0x" + "aa".repeat(65),
                  nonce: "4",
                  deadline: "1800000000",
                },
                {
                  witnessAddress: w2,
                  signature: "0x" + "bb".repeat(65),
                  nonce: "4",
                  deadline: "1800000000",
                },
              ],
            },
          },
        },
      },
    });
    ids.push(user.id);
    const { token } = await createSession(user.id);

    const res = await GET(
      new Request(APP + "/api/applications/witnesses", {
        headers: { cookie: `cr_session=${token}` },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      applicant: string;
      nameHash: string;
      nonce: string;
      deadline: string;
      signatures: { witnessAddress: string; signature: string; nonce: string; deadline: string }[];
    };
    expect(getAddress(body.applicant)).toBe(applicant);
    expect(body.nameHash).toBe(nameHashOf("A. Nakadai"));
    expect(body.nonce).toBe("4");
    expect(body.signatures).toHaveLength(2);
    expect(body.signatures[0].nonce).toBe("4");
    expect(body.signatures[0].deadline).toBe("1800000000");
  });
});
