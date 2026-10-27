import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, FileUp, LoaderCircle, ScanText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { analyzeDocument, registerDocument } from "@/lib/documents.functions";
import { analysisSchema, validateAnalysisFile } from "@/lib/document-analysis";
import { DOC_TYPES, errMsg } from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export function DocumentUpload({ operationId }: { operationId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState(DOC_TYPES[0] ?? "Autre document");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const register = useServerFn(registerDocument);
  const analyze = useServerFn(analyzeDocument);
  const qc = useQueryClient();
  async function upload() {
    if (!file || busy) return;
    setBusy(true); setError("");
    try {
      validateAnalysisFile(file.type, file.size);
      const { data: session } = await supabase.auth.getUser();
      if (!session.user) throw new Error("Veuillez vous reconnecter.");
      const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" }[file.type] ?? "pdf";
      const path = `${operationId}/${session.user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("justificatifs").upload(path, file, { contentType: file.type });
      if (uploadError) throw uploadError;
      const doc = await register({ data: { operationId, path, docType: type } });
      setFile(null);
      await qc.invalidateQueries({ queryKey: ["op", operationId] });
      toast.success("Pièce déposée — à vérifier.");
      const response = await analyze({ data: { documentId: doc.id } });
      if (response.error) setError(response.error);
      await qc.invalidateQueries({ queryKey: ["document-analysis", doc.id] });
    } catch (e) { setError(errMsg(e)); }
    finally { setBusy(false); }
  }
  return <div className="space-y-3 border-y py-5">
    <h3 className="flex items-center gap-2 font-semibold"><FileUp className="size-4" /> Déposer et analyser une pièce</h3>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="min-w-0 space-y-2"><Label htmlFor="document-type">Type de pièce</Label><Select value={type} onValueChange={setType} disabled={busy}><SelectTrigger id="document-type" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{DOC_TYPES.map(t => <SelectItem value={t} key={t}>{t}</SelectItem>)}</SelectContent></Select></div>
      <div className="min-w-0 space-y-2"><Label htmlFor="document-file">Justificatif · JPEG, PNG, WebP, PDF · 10 Mo max.</Label><Input id="document-file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={busy} onChange={e => { setError(""); const f = e.target.files?.[0]; if (!f) { setFile(null); return; } try { validateAnalysisFile(f.type, f.size); setFile(f); } catch (err) { setFile(null); setError(errMsg(err)); } }} /></div>
    </div>
    <Button disabled={!file || busy} onClick={upload}>{busy ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : <ScanText className="size-4" />}{busy ? "Dépôt et analyse en cours…" : "Téléverser et analyser"}</Button>
    {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
  </div>;
}

export function DocumentAnalysis({ documentId, canAnalyze }: { documentId: string; canAnalyze: boolean }) {
  const analyze = useServerFn(analyzeDocument);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const analysis = useQuery({ queryKey: ["document-analysis", documentId], queryFn: async () => {
    const { data, error } = await supabase.from("document_ai_analyses").select("result, analyzed_at").eq("document_id", documentId).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const parsed = analysisSchema.safeParse(data.result);
    return parsed.success ? { result: parsed.data, date: data.analyzed_at } : null;
  } });
  async function run() {
    setBusy(true); setError("");
    try { const result = await analyze({ data: { documentId } }); if (result.error) setError(result.error); else await qc.invalidateQueries({ queryKey: ["document-analysis", documentId] }); }
    catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  }
  const a = analysis.data?.result;
  const fields = a ? [["Référence", a.reference], ["Date", a.date], ["Émetteur", a.issuer], ["Bénéficiaire", a.beneficiary], ["Montant", a.amount], ["Devise", a.currency], ["Motif", a.purpose], ["Signature", a.signature_present === null ? null : a.signature_present ? "Visible" : "Non visible"]] : [];
  return <div className="w-full space-y-3 border-t pt-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-2 text-sm font-medium"><ScanText className="size-4" /> Analyse IA {a && "· à confirmer"}</span>{canAnalyze && <Button size="sm" variant="outline" disabled={busy} onClick={run}>{busy && <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />}{busy ? "Analyse en cours…" : a ? "Analyser à nouveau" : "Analyser la pièce"}</Button>}</div>
    {(error || analysis.error) && <p role="alert" className="break-words text-sm text-destructive">{error || errMsg(analysis.error)}</p>}
    {a && <><p className="text-sm">{a.summary}</p><dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">{fields.map(([k, v]) => <div className="min-w-0" key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="break-words">{v ?? "Non identifié"}</dd></div>)}</dl>
      {a.missing.length > 0 ? <div className="border-l-2 border-warning pl-3"><p className="flex items-center gap-2 font-medium"><AlertTriangle className="size-4 text-warning" /> Éléments manquants ou illisibles</p><ul className="list-inside list-disc text-sm">{a.missing.map((m, i) => <li key={i}>{m}</li>)}</ul></div> : <p className="text-sm text-success">Aucun élément manquant signalé par l’IA.</p>}
      {a.warnings.length > 0 && <div className="border-l-2 border-destructive pl-3"><p className="font-medium">Points à vérifier</p><ul className="list-inside list-disc text-sm">{a.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></div>}
      <p className="text-xs text-muted-foreground">Analyse indicative · {analysis.data && new Date(analysis.data.date).toLocaleString("fr-FR")} · Ne vaut ni validation de la pièce ni approbation de l’opération.</p></>}
  </div>;
}