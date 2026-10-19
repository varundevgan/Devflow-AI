import { z } from "zod";

export const ORGANIZATION_NAME_MAX_LENGTH = 100;

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(1).max(ORGANIZATION_NAME_MAX_LENGTH),
});

export type CreateOrganizationDto = z.infer<typeof createOrganizationSchema>;
