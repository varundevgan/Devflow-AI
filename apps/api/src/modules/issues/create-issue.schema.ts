import { z } from "zod";

export const createIssuesSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

export type IssuesDto = z.infer<typeof createIssuesSchema>;
