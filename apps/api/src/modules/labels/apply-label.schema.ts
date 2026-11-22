import { z } from "zod";

export const applyLabelSchema = z.object({
  labelId: z.uuid(),
});

export type ApplyLabelDto = z.infer<typeof applyLabelSchema>;
