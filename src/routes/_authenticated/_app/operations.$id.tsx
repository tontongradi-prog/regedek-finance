import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { DOC_STATUS_LABEL, DOC_TYPES, errMsg, fmt, OP_TYPE_LABEL, useMe } from "@/lib/finance";
import { StatusBadge } from "@/components/StatusBadge";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { DocumentAnalysis, DocumentUpload } from "@/components/DocumentAnalysis";
import {
  decideOperation,
  deferOperation,
  executeOperation,
  resubmitOperation,
  submitOperation,
} from "@/lib/operation-workflow";

export const Route = createFileRoute("/_authenticated/_app/operations/$id")({
  head: () => ({
    meta: [
      { title: "Dossier d'opération — REGEDEK FINANCE" },
      { name: "description", content: "Détails, validation et justificatifs d'une opération." },
      { property: "og:title", content: "Dossier d'opération — REGEDEK FINANCE" },
      {
        property: "og:description",
        content: "Détails, validation et justificatifs d'une opération.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Detail,
});

function Detail() {
  const { id } = Route.useParams();
  const { data: me } = useMe();
  const qc = useQueryClient();
  useRealtimeInvalidate([["op", id]]);
  const op = useQuery({
    queryKey: ["op", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operations")
        .select("*, documents(*)")
        .eq("id", id)
        .single();
      if (error || !data) throw error ?? new Error("Opération introuvable.");
      const profileIds = [data.created_by, data.decided_by].filter(
        (value): value is string => value !== null,
      );
      const accountIds = [data.account_id, data.dest_account_id].filter(
        (value): value is string => value !== null,
      );
      const [auditResult, accountsResult] = await Promise.all([
        supabase.from("audit_log").select("*").eq("object_id", id).order("created_at"),
        supabase.from("accounts").select("id, name, currency").in("id", accountIds),
      ]);
      if (auditResult.error) throw auditResult.error;
      if (accountsResult.error) throw accountsResult.error;
      const actorIds = [
        ...new Set([
          ...profileIds,
          ...(auditResult.data ?? [])
            .map((entry) => entry.user_id)
            .filter((userId): userId is string => userId !== null),
        ]),
      ];
      const profilesResult = actorIds.length
        ? await supabase.from("profiles").select("id, full_name").in("id", actorIds)
        : { data: [], error: null };
      if (profilesResult.error) throw profilesResult.error;
      return {
        ...data,
        audit: auditResult.data ?? [],
        people: profilesResult.data ?? [],
        accounts: accountsResult.data ?? [],
      };
    },
  });
  const [comment, setComment] = useState("");
  const [override, setOverride] = useState(false);
  const [qr, setQr] = useState<{ token: string; expires_at: string } | null>(null);
  const [processing, setProcessing] = useState(false);

  async function run(fn: () => PromiseLike<{ error: unknown }>, ok: string) {
    if (processing) return;
    setProcessing(true);
    try {
      const { error } = await fn();
      if (error) {
        toast.error(errMsg(error));
        return;
      }
      toast.success(ok);
      await qc.invalidateQueries();
    } catch (error) {
      toast.error(errMsg(error));
    } finally {
      setProcessing(false);
    }
  }

  async function genQr() {
    const { data, error } = await supabase.rpc("create_upload_token", { _op: id });
    if (error) {
      toast.error(errMsg(error));
      return;
    }
    if (!data?.[0]) {
      toast.error("Le QR code n’a pas pu être créé.");
      return;
    }
    setQr(data[0]);
  }

  async function openDoc(path: string) {
    try {
      const { data, error } = await supabase.storage
        .from("justificatifs")
        .createSignedUrl(path, 120);
      if (error) {
        toast.error(errMsg(error));
        return;
      }
      if (!data) {
        toast.error("Le justificatif n’est pas disponible.");
        return;
      }
      window.open(data.signedUrl, "_blank");
    } catch (error) {
      toast.error(errMsg(error));
    }
  }

  const o = op.data;
  if (op.isError) {
    return (
      <p
        role="alert"
        className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive"
      >
        Impossible de charger l’opération : {errMsg(op.error)}
      </p>
    );
  }
  if (!o) return <p className="text-muted-foreground">Chargement…</p>;
  const mine = o.created_by === me?.id;
  const accountName = (accountId: string | null) =>
    o.accounts.find((account) => account.id === accountId)?.name ?? "—";
  const personName = (userId: string | null) =>
    o.people.find((person) => person.id === userId)?.full_name ?? "—";
  const needsDecisionReason = comment.trim().length === 0;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="amount text-sm text-muted-foreground">{o.reference}</p>
          <h1 className="text-3xl font-semibold">
            {OP_TYPE_LABEL[o.op_type]} — <span className="amount">{fmt(o.amount, o.currency)}</span>
          </h1>
          <p className="mt-1 text-muted-foreground">{o.motif}</p>
        </div>
        <StatusBadge status={o.status} />
      </header>

      <dl className="grid gap-4 rounded-lg border bg-card p-5 text-sm sm:grid-cols-3">
        <Item k="Date effective" v={o.effective_date} />
        <Item
          k="Soumise le"
          v={o.submitted_at ? new Date(o.submitted_at).toLocaleString("fr-FR") : "—"}
        />
        <Item k="Initiateur" v={personName(o.created_by)} />
        <Item
          k={o.op_type === "transfert" || o.op_type === "change" ? "Compte source" : "Compte"}
          v={accountName(o.account_id)}
        />
        {(o.op_type === "transfert" || o.op_type === "change") && (
          <Item k="Compte destination" v={accountName(o.dest_account_id)} />
        )}
        <Item k="Période" v={o.period} />
        <Item k="Catégorie" v={o.category ?? "—"} />
        <Item k="Bénéficiaire" v={o.beneficiary ?? "—"} />
        <Item k="Frais" v={fmt(o.fees, o.currency)} />
        {o.op_type === "change" && (
          <Item k="Taux / destination" v={`${o.exchange_rate} → ${fmt(o.dest_amount)}`} />
        )}
        {o.decision_comment && <Item k="Décision DG" v={o.decision_comment} />}
        {o.decided_at && (
          <Item
            k="Décidé par"
            v={`${personName(o.decided_by)} — ${new Date(o.decided_at).toLocaleString("fr-FR")}`}
          />
        )}
        {o.overdraft_override && <Item k="Dérogation" v={o.override_reason ?? ""} />}
      </dl>

      <section className="flex flex-wrap gap-3">
        {o.status === "brouillon" && mine && (
          <Button
            disabled={processing}
            onClick={() => run(() => submitOperation(id), "Opération soumise à la DG")}
          >
            Soumettre à la DG
          </Button>
        )}
        {o.status === "rejetee" && mine && me?.isFin && (
          <Button
            disabled={processing}
            onClick={() => run(() => resubmitOperation(id), "Opération resoumise à la DG")}
          >
            Resoumettre après rejet
          </Button>
        )}
        {o.status === "approuvee" && me?.isFin && (
          <Button
            disabled={processing}
            onClick={() => run(() => executeOperation(id), "Opération exécutée et comptabilisée")}
          >
            Confirmer l'exécution
          </Button>
        )}
        {o.status === "approuvee" && (
          <p className="self-center text-sm text-muted-foreground">
            L’approbation n’exécute pas le paiement. L’exécution reste une étape distincte.
          </p>
        )}
      </section>

      {["soumise", "en_attente_complement"].includes(o.status) && me?.isDG && (
        <section className="space-y-3 rounded-lg border-2 border-accent bg-card p-5">
          <h2 className="text-lg font-semibold">Examen par la DG</h2>
          {mine ? (
            <p className="text-sm text-destructive">
              Vous avez créé cette opération : une validation indépendante est requise.
            </p>
          ) : (
            <>
              <Textarea
                placeholder="Motif de rejet ou complément attendu (obligatoire pour ces décisions)"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <Checkbox id="ov" checked={override} onCheckedChange={(v) => setOverride(!!v)} />
                <Label htmlFor="ov">Dérogation exceptionnelle (motif obligatoire)</Label>
              </div>
              <div className="flex gap-3">
                <Button
                  disabled={processing}
                  onClick={() => {
                    if (window.confirm(`Confirmer l’approbation de ${o.reference} ?`)) {
                      void run(
                        () => decideOperation(id, true, comment, override, override ? comment : ""),
                        "Opération approuvée — à exécuter",
                      );
                    }
                  }}
                >
                  Approuver
                </Button>
                <Button
                  disabled={processing || needsDecisionReason}
                  variant="destructive"
                  onClick={() => {
                    if (!comment.trim()) {
                      toast.error("Le motif de rejet est obligatoire.");
                      return;
                    }
                    if (window.confirm(`Confirmer le rejet de ${o.reference} ?`)) {
                      void run(() => decideOperation(id, false, comment), "Opération rejetée");
                    }
                  }}
                >
                  Rejeter
                </Button>
                {o.status === "soumise" && (
                  <Button
                    disabled={processing || needsDecisionReason}
                    variant="outline"
                    onClick={() => {
                      if (!comment.trim()) {
                        toast.error(
                          "Le commentaire expliquant le complément attendu est obligatoire.",
                        );
                        return;
                      }
                      void run(
                        () => deferOperation(id, comment),
                        "Opération mise en attente de complément",
                      );
                    }}
                  >
                    Mettre en attente
                  </Button>
                )}
              </div>
            </>
          )}
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Pièces justificatives</h2>
          {me?.isFin && (
            <Button variant="outline" onClick={genQr}>
              Générer un QR code de dépôt
            </Button>
          )}
        </div>
        {me?.isFin && me.active && <DocumentUpload operationId={id} />}
        {qr && (
          <div className="flex flex-wrap items-center gap-6 rounded-lg border bg-card p-5">
            <div className="rounded bg-card p-2">
              <QRCodeSVG value={`${window.location.origin}/depot/${qr.token}`} size={176} />
            </div>
            <div className="space-y-2 text-sm">
              <p>Scannez avec le téléphone. Connexion requise sur le téléphone.</p>
              <p className="text-muted-foreground">
                Valable jusqu'à {new Date(qr.expires_at).toLocaleTimeString("fr-FR")} — limité à
                cette opération.
              </p>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await supabase.rpc("revoke_upload_token", { _token: qr.token });
                  setQr(null);
                  toast.success("QR révoqué");
                }}
              >
                Révoquer
              </Button>
            </div>
          </div>
        )}
        {o.documents.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Aucune pièce reçue.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {o.documents.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"
              >
                <div>
                  <Button
                    variant="link"
                    className="h-auto whitespace-normal p-0 text-left"
                    onClick={() => openDoc(d.storage_path)}
                  >
                    {d.doc_type}
                  </Button>
                  <div className="text-xs text-muted-foreground">
                    {new Date(d.received_at).toLocaleString("fr-FR")} {d.via_qr && "· via QR"} ·{" "}
                    {DOC_STATUS_LABEL[d.status]}
                    {d.comment ? ` · ${d.comment}` : ""}
                  </div>
                </div>
                {d.status === "recu" && d.uploaded_by !== me?.id && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        run(
                          () =>
                            supabase.rpc("review_document", { _id: d.id, _ok: true, _comment: "" }),
                          "Pièce vérifiée",
                        )
                      }
                    >
                      Vérifier
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const c = prompt("Motif du rejet ?");
                        if (c)
                          run(
                            () =>
                              supabase.rpc("review_document", {
                                _id: d.id,
                                _ok: false,
                                _comment: c,
                              }),
                            "Pièce rejetée",
                          );
                      }}
                    >
                      Rejeter
                    </Button>
                  </div>
                )}
                <DocumentAnalysis documentId={d.id} canAnalyze={me?.isFin === true && me.active} />
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Types attendus : {DOC_TYPES.slice(0, 5).join(" · ")}
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">Historique</h2>
        <ol className="space-y-2 text-sm">
          {o.audit.map((a) => (
            <li key={a.id} className="flex flex-wrap gap-2">
              <span className="amount text-muted-foreground">
                {new Date(a.created_at).toLocaleString("fr-FR")}
              </span>
              <span>{a.action}</span>
              {a.user_id && (
                <span className="text-muted-foreground">· {personName(a.user_id)}</span>
              )}
              {a.details &&
                typeof a.details === "object" &&
                !Array.isArray(a.details) &&
                typeof a.details.comment === "string" && (
                  <span className="text-muted-foreground">· {a.details.comment}</span>
                )}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Item({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs uppercase text-muted-foreground">{k}</dt>
      <dd className="mt-0.5">{v}</dd>
    </div>
  );
}
