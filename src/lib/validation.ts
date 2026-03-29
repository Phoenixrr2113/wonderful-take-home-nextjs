import { z, ZodError } from "zod";

export const searchSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().min(0),
});

export const distanceSchema = z.object({
  airport1_id: z.coerce.number().int(),
  airport2_id: z.coerce.number().int(),
});

export const closestSchema = z.object({
  country1: z.string().min(1).max(100),
  country2: z.string().min(1).max(100),
});

export const routeSchema = z.object({
  airport1_id: z.coerce.number().int(),
  airport2_id: z.coerce.number().int(),
});

export function formatZodErrors(error: ZodError): Record<string, string[]> {
  const formatted: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!formatted[key]) formatted[key] = [];
    formatted[key].push(issue.message);
  }
  return formatted;
}
