import { z } from "zod";

export const createCommentsSchema = z.object({
  body: z.string().trim().min(1).max(10000),
});

export type CommentsDto = z.infer<typeof createCommentsSchema>;
