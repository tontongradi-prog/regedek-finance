import { z } from "zod";

export const ANALYSIS_MODEL = "openai/gpt-6-astra";
export const ANALYSIS_MAX_BYTES = 10 * 1024 * 1024;
export const ANALYSIS_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
export const analysisSchema = z.object({
  reference: z.string().nullable(),
  date: z.string().nullable(),
  issuer: z.string().nullable(),
  beneficiary: z.string().nullable(),
  amount: z.string().nullable(),
  currency: z.string().nullable(),
  purpose: z.string().nullable(),
  signature_present: z.boolean().nullable(),
  missing: z.array(z.string()),
  warnings: z.array(z.string()),
  summary: z.string(),
}).strict();
export type DocumentAnalysis = z.infer<typeof analysisSchema>;

export function canAnalyzeDocument(roles: string[], active: boolean) {
  return active && roles.includes("financier");
}

export function validateAnalysisFile(type: string, size: number) {
  if (!ANALYSIS_MIME_TYPES.includes(type)) throw new Error("Formats acceptés pour l’analyse : JPEG, PNG, WebP et PDF.");
  if (size <= 0) throw new Error("Le fichier est vide.");
  if (size > ANALYSIS_MAX_BYTES) throw new Error("Le fichier dépasse 10 Mo.");
}