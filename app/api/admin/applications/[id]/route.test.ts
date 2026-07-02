// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { __resetRateLimit } from "@/lib/auth/ratelimit";
import {
  seedAdminFixtures,
  cleanupAdminFixtures,
  adminGet,
  expectNoSecretKeys,
  type AdminFixtures,
} from "@/test/adminTestUtils";
import { GET } from "./route";

let f: AdminFixtures;
let applicantId: string;
let appId: string;

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

interface DetailBody {
  application: {
    id: string;
    status: string;
    kycStatus: string;
    reviewNote: string | null;
    user: { email: string | null; name: string | null };
    witnessSignatures: Array<{
      witnessAddress: string;
      signature: string;
      nonce: string;
      deadline: string;
    }>;
    chainCache: {
      chainDerived: true;
      sealTxHash: string | null;
      citizenTokenId: string | null;
      sealedAt: string | null;
    };
  };
}

describe("GET /api/admin/applications/[id]", () => {
  beforeAll(async () => {
    f = await seedAdminFixtures("adm-app-detail");
    const applicant = await prisma.user.create({
      data: {
        email: `adm-app-detail-${Date.now()}@w9adm.example`,
        application: {
          create: {
            status: "WITNESSED",
            name: "Ada L.",
            domicileCity: "Lagos",
            hostCountry: "Nigeria",
            sealTxHash: "0xseal",
            citizenTokenId: "12",
            witnessSignatures: {
              create: {
                witnessAddress: "0x00000000000000000000000000000000000000AA",
                signature: "0xsig",
                nonce: "1",
                deadline: "9999999999",
              },
            },
          },
        },
      },
      include: { application: true },
    });
    applicantId = applicant.id;
    appId = applicant.application!.id;
  });

  beforeEach(() => __resetRateLimit());

  it("401 / 401-suspended / 403-role / 404 standard cases", async () => {
    expect((await GET(adminGet(`/api/admin/applications/${appId}`), params(appId))).status).toBe(
      401,
    );
    expect(
      (
        await GET(
          adminGet(`/api/admin/applications/${appId}`, f.suspendedAdminToken),
          params(appId),
        )
      ).status,
    ).toBe(401);
    expect(
      (await GET(adminGet(`/api/admin/applications/${appId}`, f.userToken), params(appId))).status,
    ).toBe(403);
    expect(
      (await GET(adminGet(`/api/admin/applications/nope`, f.adminToken), params("nope"))).status,
    ).toBe(404);
  });

  it("returns the full application incl. witness signatures (PUBLIC data) + chainDerived labels — no secrets", async () => {
    const res = await GET(
      adminGet(`/api/admin/applications/${appId}`, f.adminToken),
      params(appId),
    );
    expect(res.status).toBe(200);
    const raw = await res.text();
    expectNoSecretKeys(raw);
    const body = JSON.parse(raw) as DetailBody;
    expect(body.application.id).toBe(appId);
    expect(body.application.status).toBe("WITNESSED");
    expect(body.application.user.email).toContain("adm-app-detail-");
    expect(body.application.witnessSignatures.length).toBe(1);
    expect(body.application.witnessSignatures[0].witnessAddress).toBe(
      "0x00000000000000000000000000000000000000AA",
    );
    expect(body.application.chainCache.chainDerived).toBe(true);
    expect(body.application.chainCache.sealTxHash).toBe("0xseal");
    expect(body.application.chainCache.citizenTokenId).toBe("12");
  });

  afterAll(async () => {
    await cleanupAdminFixtures(f, [applicantId]);
    await prisma.$disconnect();
  });
});
