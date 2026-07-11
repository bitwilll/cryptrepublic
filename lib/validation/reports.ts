import { z } from "zod";
import { PENAL_GRADES, PENAL_GRADE_BANDS, REPORT_CATEGORIES } from "@/lib/gov/types";
import { CIVIC_ID_RE } from "@/lib/identity/civicId";

/** Wave 17 — conduct reports. Filed against a Civic ID; verified with a
 *  Penal Code grade whose penalty must sit inside the grade's band. */

export const fileReportSchema = z
  .object({
    subjectCivicId: z.string().regex(CIVIC_ID_RE, "That is not a valid Civic ID (CR-XXXX-XXXX)."),
    category: z.enum(REPORT_CATEGORIES),
    body: z.string().min(20).max(2000),
  })
  .strict();

export const decideReportSchema = z
  .object({
    action: z.enum(["verify", "dismiss"]),
    grade: z.enum(PENAL_GRADES).optional(),
    penalty: z.number().int().optional(),
    note: z.string().max(500).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.action === "verify") {
      if (!v.grade) {
        ctx.addIssue({
          code: "custom",
          path: ["grade"],
          message: "Verification requires a grade.",
        });
        return;
      }
      const band = PENAL_GRADE_BANDS[v.grade];
      if (v.penalty == null || v.penalty < band.min || v.penalty > band.max) {
        ctx.addIssue({
          code: "custom",
          path: ["penalty"],
          message: `Grade ${v.grade} penalties must be between ${band.min} and ${band.max}.`,
        });
      }
      if (!v.note || v.note.trim().length === 0) {
        ctx.addIssue({ code: "custom", path: ["note"], message: "Verification requires a note." });
      }
    }
  });

export const referralLinkCreateSchema = z
  .object({
    label: z.string().min(1).max(60).optional(),
  })
  .strict();

export const referralLinkRevokeSchema = z
  .object({
    linkId: z.string().min(1).max(64),
  })
  .strict();
