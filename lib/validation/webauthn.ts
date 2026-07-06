import { z } from "zod";

// The browser ceremony responses are library-defined JSON (RegistrationResponseJSON /
// AuthenticationResponseJSON) — we validate ONLY the fields our routes touch and
// pass the rest through untouched for @simplewebauthn/server to verify
// (z.looseObject: unknown keys preserved). Top level stays .strict().
const ceremonyResponse = z.looseObject({
  id: z.string().min(1),
  response: z.looseObject({ clientDataJSON: z.string().min(1) }),
});

export const webauthnRegisterVerifySchema = z
  .object({
    response: ceremonyResponse,
    label: z.string().trim().max(64).optional(),
  })
  .strict();

export const webauthnLoginVerifySchema = z
  .object({
    response: ceremonyResponse,
  })
  .strict();

export const webauthnCredentialDeleteSchema = z
  .object({
    credentialId: z.string().min(1).max(1024),
  })
  .strict();

export const webauthn2faSchema = z
  .object({
    enabled: z.boolean(),
  })
  .strict();
