export function safeAiError(error: unknown): { message: string; status?: number | undefined; workspaceBlock: boolean } {
  if (error && typeof error === "object") {
    const e = error as { statusCode?: number; responseBody?: string; message?: string; cause?: unknown };
    if (e.cause && !e.statusCode) return safeAiError(e.cause);
    if (e.responseBody) {
      try {
        const body = JSON.parse(e.responseBody);
        const detail = body.error ?? body;
        const message = detail.message ?? body.message;
        if (typeof message === "string") return { message, status: e.statusCode, workspaceBlock: ["credit_limit_reached", "ai_disabled", "model_vendor_not_enabled", "model_requires_retention_consent", "provider_not_available_in_region"].includes(detail.type ?? detail.code) };
      } catch { /* Not a JSON error response. */ }
    }
    if (e.statusCode) return { message: `L’analyse IA est indisponible (${e.statusCode}).`, status: e.statusCode, workspaceBlock: false };
    if (e.message && !e.message.startsWith("No object generated")) return { message: e.message, workspaceBlock: false };
  }
  return { message: "La pièce n’a pas pu être analysée. Aucune validation n’a été effectuée.", workspaceBlock: false };
}