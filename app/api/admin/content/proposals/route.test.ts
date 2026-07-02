// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { __resetRateLimit } from "@/lib/auth/ratelimit";
import {
  seedAdminFixtures,
  cleanupAdminFixtures,
  adminGet,
  adminMutation,
  expectNoSecretKeys,
  standardGuardStatuses,
  STANDARD_GUARD_EXPECTED,
  type AdminFixtures,
} from "@/test/adminTestUtils";
import { GET as listProposals } from "./route";
import { GET as getProposal, PUT as putProposal } from "./[id]/route";
import { DELETE as deleteComment } from "../comments/[id]/route";

let f: AdminFixtures;
let boundId: string; // descriptionHash SET — body immutable
let freeId: string; // descriptionHash NULL — body editable
let commentId: string;
const CHAIN_ID = 313370; // fake chainId — never collides with real content rows

function itemParams(id: string) {
  return { params: Promise.resolve({ id }) };
}
function put(id: string, body: unknown, o: { token?: string; origin?: string | null } = {}) {
  return putProposal(
    adminMutation("PUT", `/api/admin/content/proposals/${id}`, body, o),
    itemParams(id),
  );
}
function delComment(id: string, o: { token?: string; origin?: string | null } = {}) {
  return deleteComment(
    adminMutation("DELETE", `/api/admin/content/comments/${id}`, undefined, o),
    itemParams(id),
  );
}

describe("/api/admin/content/proposals + comment moderation", () => {
  beforeAll(async () => {
    f = await seedAdminFixtures("adm-proposals");
    const suffix = `${Date.now()}`;
    const bound = await prisma.governanceProposalContent.create({
      data: {
        chainId: CHAIN_ID,
        proposalId: `1${suffix}`,
        title: "Hash-bound proposal",
        tag: "CIVIC",
        body: "immutable body",
        descriptionHash: "0x" + "ab".repeat(32),
      },
    });
    boundId = bound.id;
    const free = await prisma.governanceProposalContent.create({
      data: {
        chainId: CHAIN_ID,
        proposalId: `2${suffix}`,
        title: "Free proposal",
        tag: "FISCAL",
        body: "editable body",
        descriptionHash: null,
      },
    });
    freeId = free.id;
    const comment = await prisma.proposalComment.create({
      data: {
        proposalContentId: free.id,
        authorAddress: "0x00000000000000000000000000000000000000BB",
        body: "dissent text to preserve",
      },
    });
    commentId = comment.id;
  });

  beforeEach(() => __resetRateLimit());

  it("standard guard cases on PUT", async () => {
    expect(
      await standardGuardStatuses((o) => put(freeId, o.body, o), f, { title: "T", tag: "CIVIC" }),
    ).toEqual(STANDARD_GUARD_EXPECTED);
  });

  it("list + detail include comments; no secrets serialized", async () => {
    const list = await listProposals(adminGet("/api/admin/content/proposals", f.adminToken));
    expect(list.status).toBe(200);
    const raw = await list.text();
    expectNoSecretKeys(raw);
    const body = JSON.parse(raw) as { proposals: Array<{ id: string; commentCount: number }> };
    expect(body.proposals.some((p) => p.id === freeId)).toBe(true);
    expect(body.proposals.find((p) => p.id === freeId)!.commentCount).toBe(1);

    const detail = await getProposal(
      adminGet(`/api/admin/content/proposals/${freeId}`, f.adminToken),
      itemParams(freeId),
    );
    expect(detail.status).toBe(200);
    const det = (await detail.json()) as {
      proposal: { id: string };
      comments: Array<{ id: string; body: string }>;
    };
    expect(det.proposal.id).toBe(freeId);
    expect(det.comments[0].body).toBe("dissent text to preserve");
  });

  it("HASH-BOUND HONESTY (constraint #7): body change with descriptionHash set → 400; title/tag stay editable", async () => {
    const bodyEdit = await put(
      boundId,
      { title: "Hash-bound proposal", tag: "CIVIC", body: "REWRITTEN" },
      { token: f.adminToken },
    );
    expect(bodyEdit.status).toBe(400);
    expect(
      (await prisma.governanceProposalContent.findUniqueOrThrow({ where: { id: boundId } })).body,
    ).toBe("immutable body");

    const titleEdit = await put(
      boundId,
      { title: "Retitled (hash intact)", tag: "PROCEDURAL" },
      { token: f.adminToken },
    );
    expect(titleEdit.status).toBe(200);
    const row = await prisma.governanceProposalContent.findUniqueOrThrow({
      where: { id: boundId },
    });
    expect(row.title).toBe("Retitled (hash intact)");
    expect(row.tag).toBe("PROCEDURAL");
    expect(row.body).toBe("immutable body");
  });

  it("body edits pass when descriptionHash is null + audit content.proposal.update", async () => {
    const res = await put(
      freeId,
      { title: "Free proposal", tag: "FISCAL", body: "edited body" },
      { token: f.adminToken },
    );
    expect(res.status).toBe(200);
    expect(
      (await prisma.governanceProposalContent.findUniqueOrThrow({ where: { id: freeId } })).body,
    ).toBe("edited body");
    const audit = await prisma.auditLog.findFirst({
      where: { action: "content.proposal.update", targetId: freeId },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
    expect(audit!.targetType).toBe("PROPOSAL_CONTENT");
    expect((JSON.parse(audit!.beforeJson!) as { body: string }).body).toBe("editable body");
  });

  it("404 on an unknown proposal id", async () => {
    expect((await put("nope", { title: "T", tag: "CIVIC" }, { token: f.adminToken })).status).toBe(
      404,
    );
  });

  it("COMMENT MODERATION: delete removes the row and preserves the body in beforeJson (constraint #7)", async () => {
    const res = await delComment(commentId, { token: f.adminToken });
    expect(res.status).toBe(200);
    expect(await prisma.proposalComment.count({ where: { id: commentId } })).toBe(0);
    const audit = await prisma.auditLog.findFirst({
      where: { action: "content.comment.delete", targetId: commentId },
    });
    expect(audit).not.toBeNull();
    expect(audit!.targetType).toBe("COMMENT");
    expect(audit!.afterJson).toBeNull();
    const before = JSON.parse(audit!.beforeJson!) as { body: string };
    expect(before.body).toBe("dissent text to preserve");
    expect((await delComment(commentId, { token: f.adminToken })).status).toBe(404);
  });

  it("comment DELETE guard cases (403 foreign origin / 401 no cookie)", async () => {
    expect((await delComment("whatever")).status).toBe(401);
    expect(
      (await delComment("whatever", { token: f.adminToken, origin: "https://evil.example" }))
        .status,
    ).toBe(403);
  });

  afterAll(async () => {
    await prisma.governanceProposalContent.deleteMany({ where: { chainId: CHAIN_ID } });
    await prisma.auditLog.deleteMany({
      where: { targetId: { in: [boundId, freeId, commentId] } },
    });
    await cleanupAdminFixtures(f);
    await prisma.$disconnect();
  });
});
