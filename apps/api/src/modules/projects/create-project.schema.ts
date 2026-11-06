import { z } from "zod";

export const createProjectSchema = z.object({
  projectName: z.string().trim().min(4).max(100),
  projectKey: z
    .string()
    .trim()
    .min(3)
    .max(50)
    .regex(/^[A-Z0-9]+$/)
    .toUpperCase(),
});

export type CreateProjectDto = z.infer<typeof createProjectSchema>;
