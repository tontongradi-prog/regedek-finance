import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { errMsg, fmt, useMe } from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_app/comptes")({
  head: () => ({
    meta: [
      { title: "Comptes — REGEDEK FINANCE" },
      { name: "description", content: "Caisses et comptes bancaires de la REGEDEK." },
      { property: "og:title", content: "Comptes — REGEDEK FINANCE" },
      { property: "og:description", content: "Caisses et comptes bancaires de la REGEDEK." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Comptes,
});

function Comptes() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const accounts = useQuery({ queryKey: ["accounts-all"], queryFn: async () => (await supabase.from("accounts").select("*").order("name")).data ?? [] });
  const bal = useQuery({ queryKey: ["balances"], queryFn: async () => (await supabase.from("account_balances").select("*")).data ?? [] });

  async function setOpening(id: string) {
    const v = prompt("Solde d'ouverture réel (ex. 1250.00) ?");
    if (!v) return;
    const d = prompt("Date de référence (AAAA-MM-JJ) ?", new Date().toISOString().slice(0, 10));
    if (!d) return;
    const { error } = await supabase.rpc("set_opening_balance", { _account: id, _amount: Number(v), _date: d });
    if (error) { toast.error(errMsg(error)); return; }
    toast.success("Solde saisi — en attente de validation DG");
    qc.invalidateQueries();
  }
  async function validate(id: string) {
    const { error } = await supabase.rpc("validate_opening_balance", { _account: id });
    if (error) { toast.error(errMsg(error)); return; }
    toast.success("Solde d'ouverture validé");
    qc.invalidateQueries();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Comptes</h1>
      <div className="grid gap-4 md:grid-cols-2">
        {accounts.data?.map((a) => {
          const b = bal.data?.find((x) => x.id === a.id);
          return (
            <div key={a.id} className="space-y-3 rounded-lg border bg-card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-display text-lg font-semibold">{a.name}</div>
                  <div className="text-xs text-muted-foreground">{a.account_type === "caisse" ? "Caisse" : a.institution} · {a.internal_ref} · {a.active ? "Actif" : "Inactif"}</div>
                </div>
                <div className="amount text-right text-xl">{fmt(b?.balance, a.currency)}</div>
              </div>
              <div className="text-sm">
                Solde d'ouverture : {a.opening_balance === null ? <em className="text-muted-foreground">non saisi</em> : <span className="amount">{fmt(a.opening_balance, a.currency)} au {a.opening_date}</span>}
                {a.opening_balance !== null && (a.opening_validated ? <span className="ml-2 text-success">· validé</span> : <span className="ml-2 text-warning">· à valider</span>)}
              </div>
              <div className="flex gap-2">
                {me?.isFin && !a.opening_validated && <Button size="sm" variant="outline" onClick={() => setOpening(a.id)}>Saisir le solde d'ouverture</Button>}
                {me?.isDG && !a.opening_validated && a.opening_balance !== null && <Button size="sm" onClick={() => validate(a.id)}>Valider</Button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
