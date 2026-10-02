import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().pipe(z.email()),
  password: z.string().min(8),
});

export type RegisterDto = z.infer<typeof registerSchema>;
