import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmt, sumCents, useMe, OP_TYPE_LABEL, type OpStatus, type OpType } from "@/lib/finance";
import { StatusBadge } from "@/components/StatusBadge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";

export const Route = createFileRoute("/_authenticated/_app/tableau-de-bord")({
  head: () => ({
    meta: [
      { title: "Tableau de bord — REGEDEK FINANCE" },
      { name: "description", content: "Soldes, validations en attente et activité récente." },
      { property: "og:title", content: "Tableau de bord — REGEDEK FINANCE" },
      {
        property: "og:description",
        content: "Soldes, validations en attente et activité récente.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { data: me } = useMe();
  const [typeFilter, setTypeFilter] = useState<OpType | "all">("all");
  const [dateFilter, setDateFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "soumise" | "en_attente_complement">(
    "all",
  );
  useRealtimeInvalidate([
    ["balances"],
    ["ops"],
    ["approval-ops"],
    ["approval-people"],
    ["notifications"],
  ]);
  const balances = useQuery({
    queryKey: ["balances"],
    queryFn: async () => {
      const { data, error } = await supabase.from("account_balances").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const ops = useQuery({
    queryKey: ["ops"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operations")
        .select("*, documents(id,status)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
  const approvalOps = useQuery({
    queryKey: ["approval-ops"],
    enabled: me?.isDG === true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operations")
        .select("*, documents(id,status,doc_type)")
        .in("status", ["soumise", "en_attente_complement"])
        .order("submitted_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
  const approvalIds = (approvalOps.data ?? []).map((op) => op.created_by);
  const people = useQuery({
    queryKey: ["approval-people", approvalIds],
    enabled: me?.isDG === true && approvalIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", approvalIds);
      if (error) throw error;
      return data ?? [];
    },
  });
  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, operation_id, message, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const list = ops.data ?? [];
  const pending = list.filter((o) => ["soumise", "en_attente_complement"].includes(o.status));
  const toExec = list.filter((o) => o.status === "approuvee");
  const drafts = list.filter((o) => o.status === "brouillon");
  const noDocs = list.filter(
    (o) => ["approuvee", "executee"].includes(o.status) && (o.documents?.length ?? 0) === 0,
  );
  const toVerify = list.flatMap((o) => o.documents ?? []).filter((d) => d.status === "recu");
  const overrides = list.filter((o) => o.overdraft_override);

  const byCur = (c: "USD" | "CDF") =>
    sumCents(
      (balances.data ?? []).filter((b) => b.currency === c && b.active).map((b) => b.balance),
    );

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm text-muted-foreground">
          {me?.isDG ? "Vue de direction" : "Vue du responsable financier"}
        </p>
        <h1 className="text-3xl font-semibold">Tableau de bord</h1>
      </header>

      {(balances.isError || ops.isError) && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive"
        >
          Impossible de charger les données financières :{" "}
          {balances.error?.message ?? ops.error?.message}
        </p>
      )}

      <section className="grid gap-4 md:grid-cols-2">
        {(["USD", "CDF"] as const).map((c) => (
          <div key={c} className="rounded-lg bg-primary p-6 text-primary-foreground">
            <div className="text-xs uppercase tracking-widest opacity-70">
              Trésorerie totale {c}
            </div>
            <div className="amount mt-2 text-3xl">{fmt(byCur(c), c)}</div>
            <div className="mt-1 text-xs opacity-60">
              Somme des soldes comptabilisés, sans conversion
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(balances.data ?? []).map((b) => (
          <div key={b.id} className="rounded-lg border bg-card p-4">
            <div className="text-sm text-muted-foreground">{b.name}</div>
            <div className="amount mt-1 text-xl">{fmt(b.balance, b.currency ?? "")}</div>
            {Number(b.committed) > 0 && (
              <div className="amount mt-1 text-xs text-warning">
                Engagé : {fmt(b.committed, b.currency ?? "")}
              </div>
            )}
          </div>
        ))}
      </section>

      <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi
          label="En attente DG"
          value={me?.isDG ? (approvalOps.data ?? []).length : pending.length}
        />
        <Kpi label="Approuvées non exécutées" value={toExec.length} />
        <Kpi label="Brouillons" value={drafts.length} />
        <Kpi label="Sans justificatif" value={noDocs.length} />
        <Kpi label="Pièces à vérifier" value={toVerify.length} />
        <Kpi label="Dérogations" value={overrides.length} />
      </section>

      {me?.isDG ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Opérations à valider</h2>
              <p className="text-sm text-muted-foreground">
                {(approvalOps.data ?? []).length} opération(s) en attente de décision
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Select
                value={typeFilter}
                onValueChange={(value) => setTypeFilter(value as OpType | "all")}
              >
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Tous les types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les types</SelectItem>
                  {(["recette", "depense", "transfert", "change"] as OpType[]).map((type) => (
                    <SelectItem key={type} value={type}>
                      {OP_TYPE_LABEL[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                aria-label="Filtrer par date d’opération"
                type="date"
                value={dateFilter}
                onChange={(event) => setDateFilter(event.target.value)}
                className="w-44"
              />
              <Select
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}
              >
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les statuts à traiter</SelectItem>
                  <SelectItem value="soumise">En attente de validation DG</SelectItem>
                  <SelectItem value="en_attente_complement">En attente de complément</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {approvalOps.isError && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive"
            >
              Impossible de charger les opérations à valider : {approvalOps.error.message}
            </p>
          )}
          {people.isError && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive"
            >
              Impossible de charger les noms des initiateurs : {people.error.message}
            </p>
          )}
          <ApprovalTable
            rows={(approvalOps.data ?? []).filter(
              (op) =>
                (typeFilter === "all" || op.op_type === typeFilter) &&
                (!dateFilter || op.effective_date === dateFilter) &&
                (statusFilter === "all" || op.status === statusFilter),
            )}
            accounts={balances.data ?? []}
            people={people.data ?? []}
          />
        </section>
      ) : (
        <section>
          <h2 className="mb-3 text-xl font-semibold">À suivre</h2>
          <OpTable rows={[...toExec, ...drafts, ...pending].slice(0, 10)} />
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Notifications</h2>
        {notifications.isError ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive"
          >
            Impossible de charger les notifications : {notifications.error.message}
          </p>
        ) : notifications.data?.length ? (
          <ul className="divide-y rounded-lg border bg-card">
            {notifications.data.map((notification) => (
              <li
                key={notification.id}
                className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
              >
                <span>{notification.message}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(notification.created_at).toLocaleString("fr-FR")}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Aucune notification.
          </p>
        )}
      </section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="amount text-2xl">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

type Row = {
  id: string;
  reference: string;
  op_type: keyof typeof OP_TYPE_LABEL;
  motif: string;
  amount: number;
  currency: string;
  status: Parameters<typeof StatusBadge>[0]["status"];
  effective_date: string;
};

export function OpTable({ rows }: { rows: Row[] }) {
  if (!rows.length)
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Aucune opération.
      </p>
    );
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="p-3">Référence</th>
            <th className="p-3">Type</th>
            <th className="p-3">Motif</th>
            <th className="p-3">Date</th>
            <th className="p-3 text-right">Montant</th>
            <th className="p-3">Statut</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id} className="border-t hover:bg-muted/50">
              <td className="p-3">
                <Link
                  to="/operations/$id"
                  params={{ id: o.id }}
                  className="amount text-primary underline-offset-2 hover:underline"
                >
                  {o.reference}
                </Link>
              </td>
              <td className="p-3">{OP_TYPE_LABEL[o.op_type]}</td>
              <td className="max-w-xs truncate p-3">{o.motif}</td>
              <td className="p-3">{o.effective_date}</td>
              <td className="amount p-3 text-right">{fmt(o.amount, o.currency)}</td>
              <td className="p-3">
                <StatusBadge status={o.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type ApprovalRow = {
  id: string;
  reference: string;
  op_type: OpType;
  status: OpStatus;
  effective_date: string;
  submitted_at: string | null;
  amount: number;
  currency: string;
  account_id: string;
  dest_account_id: string | null;
  category: string | null;
  motif: string;
  created_by: string;
  documents: { id: string; doc_type: string; status: string }[];
};

type AccountSummary = { id: string | null; name: string | null; currency: string | null };
type PersonSummary = { id: string; full_name: string | null };

function ApprovalTable({
  rows,
  accounts,
  people,
}: {
  rows: ApprovalRow[];
  accounts: AccountSummary[];
  people: PersonSummary[];
}) {
  if (!rows.length)
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Aucune opération à valider avec ces filtres.
      </p>
    );
  const name = (id: string | null) => accounts.find((account) => account.id === id)?.name ?? "—";
  const person = (id: string) => people.find((entry) => entry.id === id)?.full_name ?? "—";
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="p-3">Référence / statut</th>
            <th className="p-3">Type / date</th>
            <th className="p-3 text-right">Montant</th>
            <th className="p-3">Compte(s)</th>
            <th className="p-3">Catégorie / motif</th>
            <th className="p-3">Initiateur / soumission</th>
            <th className="p-3">Justificatifs</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((op) => (
            <tr key={op.id} className="border-t align-top hover:bg-muted/50">
              <td className="p-3">
                <Link
                  to="/operations/$id"
                  params={{ id: op.id }}
                  className="amount text-primary underline-offset-2 hover:underline"
                >
                  {op.reference}
                </Link>
                <div className="mt-1">
                  <StatusBadge status={op.status} />
                </div>
              </td>
              <td className="p-3">
                {OP_TYPE_LABEL[op.op_type]}
                <div className="text-xs text-muted-foreground">{op.effective_date}</div>
              </td>
              <td className="amount p-3 text-right">{fmt(op.amount, op.currency)}</td>
              <td className="p-3">
                {name(op.account_id)}
                {op.dest_account_id && (
                  <div className="text-xs text-muted-foreground">→ {name(op.dest_account_id)}</div>
                )}
              </td>
              <td className="p-3">
                {op.category ?? "—"}
                <div className="max-w-xs truncate text-xs text-muted-foreground">{op.motif}</div>
              </td>
              <td className="p-3">
                {person(op.created_by)}
                <div className="text-xs text-muted-foreground">
                  {op.submitted_at ? new Date(op.submitted_at).toLocaleString("fr-FR") : "—"}
                </div>
              </td>
              <td className="p-3">
                {op.documents.length
                  ? op.documents.map((document) => document.doc_type).join(", ")
                  : "Aucune pièce"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
