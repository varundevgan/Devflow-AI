import { z } from "zod";

// A display name, not a slug. Long enough for "Acme Platform Engineering",
// short enough that a pasted document cannot land in headers, audit rows, or a prompt.
export const ORGANIZATION_NAME_MAX_LENGTH = 100;

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(1).max(ORGANIZATION_NAME_MAX_LENGTH),
});

export type CreateOrganizationDto = z.infer<typeof createOrganizationSchema>;
