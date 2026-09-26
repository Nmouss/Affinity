import { z } from "zod";

export const spriteOpinionSchema = z.object({
  spriteId: z.string(),
  say: z.string(),
  hardRules: z.array(z.object({
    type: z.enum(["maxHeight", "excludedTag"]),
    inches: z.number().optional(),
    tag: z.string().optional(),
    why: z.string(),
  })),
  wishes: z.array(z.string()),
  vetoes: z.array(z.string()),
});

export const spriteScoreSchema = z.object({
  spriteId: z.string(),
  score: z.number().min(0).max(10),
  say: z.string(),
  complaint: z.string().optional(),
});
