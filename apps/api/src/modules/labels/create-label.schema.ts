import { z } from "zod";

export const createLabelSchema = z.object({
  name: z.string().trim().min(1).max(50),
});

export type CreateLabelDto = z.infer<typeof createLabelSchema>;
