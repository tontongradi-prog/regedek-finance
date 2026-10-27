import { Link, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  LayoutDashboard,
  ListChecks,
  Landmark,
  ScrollText,
  LogOut,
  Wifi,
  WifiOff,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/finance";
import { Button } from "@/components/ui/button";
import logoAsset from "@/assets/regedek-logo.png.asset.json";
import { toast } from "sonner";
import { useOnline } from "@/hooks/use-online";

const NAV = [
  { to: "/tableau-de-bord", label: "Tableau de bord", icon: LayoutDashboard },
  { to: "/operations", label: "Opérations", icon: ListChecks },
  { to: "/comptes", label: "Comptes", icon: Landmark },
  { to: "/audit", label: "Journal d'audit", icon: ScrollText },
] as const;

export function AppShell() {
  const { data: me, isLoading } = useMe();
  const online = useOnline();

  useEffect(() => {
    if (!me?.id || !me.active) return;
    const channel = supabase
      .channel(`notifications-${me.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${me.id}`,
        },
        (payload) => {
          const notification = payload.new as { message?: string };
          if (notification.message) toast.info(notification.message);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [me?.id, me?.active]);

  if (isLoading) return <div className="p-10 text-muted-foreground">Chargement…</div>;
  if (me && (!me.active || !me.activeRole)) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md space-y-4 text-center">
          <h1 className="text-2xl font-semibold">Accès en attente</h1>
          <p className="text-muted-foreground">
            Votre compte ({me.email}) n'a pas le profil choisi, ou il est désactivé.
            Déconnectez-vous et choisissez un autre profil.
          </p>
          <Button variant="outline" onClick={() => supabase.auth.signOut()}>
            Se déconnecter
          </Button>
        </div>
      </div>
    );
  }

  const roleLabel = me?.isDG
    ? "Directrice générale"
    : me?.isFin
      ? "Directeur financier"
      : "Administrateur";

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col bg-sidebar text-sidebar-foreground md:w-60">
        <div className="px-5 py-5">
          <img src={logoAsset.url} alt="REGEDEK" className="w-36 rounded-md bg-white/95 p-1.5" />
          <div className="mt-2 font-display text-lg font-semibold text-sidebar-primary">
            Finance
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-0">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="flex items-center gap-3 whitespace-nowrap rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent"
              activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
            >
              <n.icon className="size-4" /> {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto hidden space-y-3 border-t border-sidebar-border p-4 text-xs md:block">
          <div className="flex items-center gap-2">
            {online ? (
              <Wifi className="size-3.5 text-sidebar-primary" />
            ) : (
              <WifiOff className="size-3.5 text-destructive" />
            )}
            {online ? "Connecté — synchronisé" : "Hors ligne"}
          </div>
          <div>
            <div className="font-medium">{me?.name}</div>
            <div className="text-sidebar-foreground/60">{roleLabel}</div>
          </div>
          <button
            className="flex items-center gap-2 text-sidebar-foreground/70 hover:text-sidebar-foreground"
            onClick={() => supabase.auth.signOut()}
          >
            <LogOut className="size-3.5" /> Déconnexion
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        {!online && (
          <div className="bg-destructive px-6 py-2 text-sm text-destructive-foreground">
            Connexion perdue : les enregistrements financiers sont bloqués jusqu'au retour du
            réseau.
          </div>
        )}
        <div className="mx-auto max-w-6xl p-5 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
