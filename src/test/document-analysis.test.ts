import { describe, expect, it } from "vitest";
import { analysisSchema, canAnalyzeDocument, validateAnalysisFile } from "@/lib/document-analysis";

describe("Justificatif financier — analyse", () => {
  it("réserve l’analyse aux Directeurs financiers actifs", () => {
    expect(canAnalyzeDocument(["financier"], true)).toBe(true);
    expect(canAnalyzeDocument(["dg"], true)).toBe(false);
    expect(canAnalyzeDocument(["financier"], false)).toBe(false);
  });
  it("conserve les informations absentes et les éléments manquants", () => {
    const result = analysisSchema.parse({ reference: null, date: null, issuer: "Fournisseur", beneficiary: null, amount: "150.00", currency: "USD", purpose: "Transport", signature_present: false, missing: ["Date", "Bénéficiaire"], warnings: [], summary: "Reçu incomplet" });
    expect(result.amount).toBe("150.00");
    expect(result.date).toBeNull();
    expect(result.missing).toEqual(["Date", "Bénéficiaire"]);
    expect(analysisSchema.safeParse({ amount: "150.00" }).success).toBe(false);
  });
  it("valide le fichier avant l’analyse", () => {
    expect(() => validateAnalysisFile("application/pdf", 10 * 1024 * 1024)).not.toThrow();
    expect(() => validateAnalysisFile("application/pdf", 10 * 1024 * 1024 + 1)).toThrow();
    expect(() => validateAnalysisFile("text/plain", 10)).toThrow();
    expect(() => validateAnalysisFile("image/png", 0)).toThrow();
  });
});