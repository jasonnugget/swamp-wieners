import { z } from "zod";

export const providerMetadataSchema = z.object({
  source: z.string(), status: z.enum(["ok", "unavailable", "error"]),
  mode: z.enum(["LIVE", "DEMO", "FORECAST", "STATIC"]),
  fetchedAt: z.string().datetime().nullable(), observedAt: z.string().datetime().nullable(),
  validUntil: z.string().datetime().nullable(), confidence: z.number().min(0).max(1),
  error: z.string().nullable(), details: z.record(z.unknown()).default({}),
});
export type ProviderMetadata = z.infer<typeof providerMetadataSchema>;
export interface ProviderEvidence<T> extends ProviderMetadata { data: T | null; fetchedAt: string; validUntil: string }
export const fieldEvidenceSchema = z.object({
  source: z.string(), mode: z.enum(["LIVE", "DEMO", "FORECAST", "STATIC"]),
  fetchedAt: z.string().datetime().nullable(), observedAt: z.string().datetime().nullable(), confidence: z.number().min(0).max(1),
});
export type FieldEvidence = z.infer<typeof fieldEvidenceSchema>;
