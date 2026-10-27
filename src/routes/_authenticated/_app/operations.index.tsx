import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  errMsg,
  OP_TYPE_LABEL,
  STATUS_LABEL,
  useMe,
  type OpStatus,
  type OpType,
} from "@/lib/finance";
import { OpTable } from "./tableau-de-bord";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useOnline } from "@/hooks/use-online";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";

export const Route = createFileRoute("/_authenticated/_app/operations/")({
  head: () => ({
    meta: [
      { title: "Opérations — REGEDEK FINANCE" },
      { name: "description", content: "Recettes, dépenses, transferts et opérations de change." },
      { property: "og:title", content: "Opérations — REGEDEK FINANCE" },
      {
        property: "og:description",
        content: "Recettes, dépenses, transferts et opérations de change.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Operations,
});

function Operations() {
  const { data: me } = useMe();
  const [status, setStatus] = useState<OpStatus | "all">("all");
  const [q, setQ] = useState("");
  useRealtimeInvalidate([["ops-list"]]);
  const ops = useQuery({
    queryKey: ["ops-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operations")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const rows = (ops.data ?? []).filter(
    (o) =>
      (status === "all" || o.status === status) &&
      (!q ||
        `${o.reference} ${o.motif} ${o.category ?? ""}`.toLowerCase().includes(q.toLowerCase())),
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-semibold">Opérations</h1>
        {me?.isFin && <NewOperation />}
      </div>
      {ops.isError && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive"
        >
          Impossible de charger les opérations : {errMsg(ops.error)}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Référence, motif, catégorie…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <Select value={status} onValueChange={(v) => setStatus(v as OpStatus | "all")}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <OpTable rows={rows} />
    </div>
  );
}

function NewOperation() {
  const navigate = useNavigate();
  const online = useOnline();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    op_type: "depense" as OpType,
    account_id: "",
    dest_account_id: "",
    amount: "",
    dest_amount: "",
    exchange_rate: "",
    fees: "",
    effective_date: new Date().toISOString().slice(0, 10),
    category: "",
    motif: "",
    beneficiary: "",
  });
  const accounts = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("*")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const src = accounts.data?.find((a) => a.id === f.account_id);
  const needsDest = f.op_type === "transfert" || f.op_type === "change";
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value });

  async function save() {
    if (!online) {
      toast.error("Hors ligne : enregistrement bloqué.");
      return;
    }
    if (!src) {
      toast.error("Choisissez un compte.");
      return;
    }
    const { data, error } = await supabase
      .from("operations")
      .insert({
        op_type: f.op_type,
        account_id: f.account_id,
        dest_account_id: needsDest ? f.dest_account_id || null : null,
        amount: Number(f.amount),
        currency: src.currency,
        dest_amount: f.op_type === "change" ? Number(f.dest_amount) : null,
        exchange_rate: f.op_type === "change" ? Number(f.exchange_rate) : null,
        fees: f.fees ? Number(f.fees) : 0,
        effective_date: f.effective_date,
        period: f.effective_date.slice(0, 7),
        category: f.category || null,
        motif: f.motif,
        beneficiary: f.beneficiary || null,
      })
      .select("id")
      .single();
    if (error) {
      toast.error(errMsg(error));
      return;
    }
    toast.success("Brouillon créé.");
    setOpen(false);
    navigate({ to: "/operations/$id", params: { id: data.id } });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Nouvelle opération</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nouvelle opération (brouillon)</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          {accounts.isError && (
            <p role="alert" className="text-sm text-destructive">
              Impossible de charger les comptes : {errMsg(accounts.error)}
            </p>
          )}
          <div className="grid gap-1.5">
            <Label>Type</Label>
            <Select value={f.op_type} onValueChange={(v) => setF({ ...f, op_type: v as OpType })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["recette", "depense", "transfert", "change"] as OpType[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {OP_TYPE_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>{needsDest ? "Compte source" : "Compte"}</Label>
            <Select value={f.account_id} onValueChange={(v) => setF({ ...f, account_id: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir" />
              </SelectTrigger>
              <SelectContent>
                {accounts.data?.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {needsDest && (
            <div className="grid gap-1.5">
              <Label>Compte destination</Label>
              <Select
                value={f.dest_account_id}
                onValueChange={(v) => setF({ ...f, dest_account_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choisir" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.data
                    ?.filter(
                      (a) =>
                        a.id !== f.account_id &&
                        (f.op_type === "transfert"
                          ? a.currency === src?.currency
                          : a.currency !== src?.currency),
                    )
                    .map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Montant {src?.currency ?? ""}</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={f.amount}
                onChange={set("amount")}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Frais</Label>
              <Input type="number" step="0.01" min="0" value={f.fees} onChange={set("fees")} />
            </div>
          </div>
          {f.op_type === "change" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Taux appliqué</Label>
                <Input
                  type="number"
                  step="0.000001"
                  value={f.exchange_rate}
                  onChange={set("exchange_rate")}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Montant destination</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={f.dest_amount}
                  onChange={set("dest_amount")}
                />
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Date effective</Label>
              <Input type="date" value={f.effective_date} onChange={set("effective_date")} />
            </div>
            <div className="grid gap-1.5">
              <Label>Catégorie</Label>
              <Input value={f.category} onChange={set("category")} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Bénéficiaire / payeur</Label>
            <Input value={f.beneficiary} onChange={set("beneficiary")} />
          </div>
          <div className="grid gap-1.5">
            <Label>Motif</Label>
            <Textarea value={f.motif} onChange={set("motif")} />
          </div>
          <Button onClick={save} disabled={!f.motif || !f.amount || !f.account_id}>
            Créer le brouillon
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
