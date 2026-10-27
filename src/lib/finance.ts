import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type OpType = Database["public"]["Enums"]["op_type"];
export type OpStatus = Database["public"]["Enums"]["op_status"];
export type AppRole = Database["public"]["Enums"]["app_role"];

export const OP_TYPE_LABEL: Record<OpType, string> = {
  recette: "Recette",
  depense: "Dépense",
  transfert: "Transfert",
  change: "Change USD/CDF",
  ouverture: "Solde d'ouverture",
  correction: "Écriture corrective",
};

export const STATUS_LABEL: Record<OpStatus, string> = {
  brouillon: "Brouillon",
  soumise: "En attente de validation DG",
  en_attente_complement: "En attente de complément",
  approuvee: "Approuvée — à exécuter",
  rejetee: "Rejetée",
  executee: "Exécutée",
  annulee: "Annulée",
};

export const DOC_TYPES = [
  "Demande / ordre de paiement",
  "Bon de sortie signé",
  "Reçu signé du bénéficiaire",
  "Facture ou pièce équivalente",
  "Preuve de virement / dépôt",
  "Autre document",
];

export const DOC_STATUS_LABEL: Record<string, string> = {
  attendu: "Attendu",
  recu: "Reçu — à vérifier",
  verifie: "Vérifié",
  rejete: "Rejeté",
  manquant: "Manquant",
};

/** Format a decimal string/number for display without float arithmetic on totals. */
export function fmt(value: number | string | null | undefined, currency?: string) {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  const s = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
  return currency ? `${s} ${currency}` : s;
}

/** Sum decimal amounts exactly using integer cents. */
export function sumCents(values: Array<number | string | null | undefined>) {
  let cents = 0n;
  for (const v of values) {
    if (v === null || v === undefined) continue;
    const [i = "0", d = ""] = String(v).split(".");
    const neg = i.startsWith("-");
    const abs = BigInt(i.replace("-", "") || "0") * 100n + BigInt((d + "00").slice(0, 2));
    cents += neg ? -abs : abs;
  }
  const neg = cents < 0n;
  const a = neg ? -cents : cents;
  return `${neg ? "-" : ""}${a / 100n}.${String(a % 100n).padStart(2, "0")}`;
}

export const ACTIVE_ROLE_KEY = "regedek-active-role";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const [{ data: roles }, { data: profile }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", u.user.id),
        supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle(),
      ]);
      const r = (roles ?? []).map((x) => x.role as AppRole);
      const chosen = (
        typeof window !== "undefined" ? localStorage.getItem(ACTIVE_ROLE_KEY) : null
      ) as AppRole | null;
      const active: AppRole | null =
        chosen && r.includes(chosen) ? chosen : r.length === 1 ? r[0]! : null;
      return {
        id: u.user.id,
        email: u.user.email ?? "",
        name: profile?.full_name ?? u.user.email ?? "",
        roles: r,
        activeRole: active,
        isDG: active === "dg",
        isFin: active === "financier",
        active: profile?.active ?? false,
      };
    },
  });
}

export function errMsg(e: unknown) {
  if (e && typeof e === "object" && "message" in e)
    return String((e as { message: string }).message);
  return "Erreur inattendue";
}
