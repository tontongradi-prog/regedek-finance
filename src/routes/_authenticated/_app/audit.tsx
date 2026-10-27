import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/_app/audit")({
  head: () => ({
    meta: [
      { title: "Journal d'audit — REGEDEK FINANCE" },
      { name: "description", content: "Trace des événements sensibles." },
      { property: "og:title", content: "Journal d'audit — REGEDEK FINANCE" },
      { property: "og:description", content: "Trace des événements sensibles." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Audit,
});

function Audit() {
  const log = useQuery({ queryKey: ["audit"], queryFn: async () => (await supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(300)).data ?? [] });
  const people = useQuery({ queryKey: ["profiles"], queryFn: async () => (await supabase.from("profiles").select("id, full_name")).data ?? [] });
  const name = (id: string | null) => people.data?.find((p) => p.id === id)?.full_name ?? "—";
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Journal d'audit</h1>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr><th className="p-3">Date</th><th className="p-3">Utilisateur</th><th className="p-3">Action</th><th className="p-3">Objet</th></tr>
          </thead>
          <tbody>
            {log.data?.map((a) => (
              <tr key={a.id} className="border-t">
                <td className="amount p-3">{new Date(a.created_at).toLocaleString("fr-FR")}</td>
                <td className="p-3">{name(a.user_id)}</td>
                <td className="p-3">{a.action}</td>
                <td className="p-3 text-muted-foreground">{a.object_type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
