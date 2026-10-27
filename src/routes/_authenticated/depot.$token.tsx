import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Camera, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DOC_TYPES, errMsg, fmt } from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import logoAsset from "@/assets/regedek-logo.png.asset.json";

export const Route = createFileRoute("/_authenticated/depot/$token")({
  head: () => ({
    meta: [
      { title: "Dépôt de pièces — REGEDEK FINANCE" },
      { name: "description", content: "Dépôt sécurisé de justificatifs depuis un téléphone." },
      { property: "og:title", content: "Dépôt de pièces — REGEDEK FINANCE" },
      { property: "og:description", content: "Dépôt sécurisé de justificatifs depuis un téléphone." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Depot,
});

const MAX = 10 * 1024 * 1024;
const OK = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];

function Depot() {
  const { token } = Route.useParams();
  const info = useQuery({
    queryKey: ["token", token],
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("resolve_upload_token", { _token: token });
      if (error) throw error;
      return data[0];
    },
  });
  const [type, setType] = useState(DOC_TYPES[0]!);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(0);

  function add(list: FileList | null) {
    const arr = Array.from(list ?? []).filter((f) => {
      if (!OK.includes(f.type)) { toast.error(`${f.name} : format refusé`); return false; }
      if (f.size > MAX) { toast.error(`${f.name} : plus de 10 Mo`); return false; }
      return true;
    });
    setFiles((p) => [...p, ...arr]);
  }

  async function send() {
    if (!info.data) return;
    setBusy(true);
    try {
      for (const f of files) {
        const ext = f.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${info.data.operation_id}/${crypto.randomUUID()}.${ext}`;
        const up = await supabase.storage.from("justificatifs").upload(path, f, { contentType: f.type });
        if (up.error) throw up.error;
        const { error } = await supabase.rpc("register_qr_document", { _token: token, _doc_type: type, _path: path });
        if (error) throw error;
        setSent((n) => n + 1);
      }
      toast.success("Pièces envoyées. Elles restent à vérifier.");
      setFiles([]);
    } catch (e) {
      toast.error(errMsg(e));
    }
    setBusy(false);
  }

  if (info.isLoading) return <p className="p-6 text-muted-foreground">Vérification du QR code…</p>;
  if (info.error || !info.data)
    return <div className="p-6"><h1 className="text-xl font-semibold">QR code invalide</h1><p className="text-muted-foreground">Il est expiré, révoqué ou vous n'êtes pas autorisé.</p></div>;

  return (
    <div className="mx-auto max-w-md space-y-5 p-5">
      <div>
        <img src={logoAsset.url} alt="REGEDEK — Régie de Gestion des Déchets de Kinshasa" className="mb-3 w-40 rounded-md bg-white/95 p-1.5" />
        <h1 className="text-2xl font-semibold">Dépôt de pièces</h1>
        <p className="amount text-sm">{info.data.reference} · {fmt(info.data.amount, info.data.currency)}</p>
        <p className="text-sm text-muted-foreground">{info.data.motif}</p>
      </div>
      <Select value={type} onValueChange={setType}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>{DOC_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
      </Select>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-5 text-sm">
          <Camera className="size-6" /> Photographier
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => add(e.target.files)} />
        </label>
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-5 text-sm">
          <Upload className="size-6" /> Importer
          <input type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => add(e.target.files)} />
        </label>
      </div>
      {files.length > 0 && <ul className="text-sm">{files.map((f, i) => <li key={i}>• {f.name}</li>)}</ul>}
      <Button className="w-full" disabled={!files.length || busy} onClick={send}>{busy ? "Envoi…" : `Confirmer l'envoi (${files.length})`}</Button>
      {sent > 0 && <p className="text-center text-sm text-success">{sent} pièce(s) reçue(s) dans le dossier.</p>}
      <p className="text-xs text-muted-foreground">L'envoi ne vaut ni approbation de la dépense ni validation du document.</p>
    </div>
  );
}
