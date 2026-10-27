import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ACTIVE_ROLE_KEY } from "@/lib/finance";
import logoAsset from "@/assets/regedek-logo.png.asset.json";

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({ next: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Connexion — REGEDEK FINANCE" },
      { name: "description", content: "Connexion sécurisée à REGEDEK FINANCE." },
      { property: "og:title", content: "Connexion — REGEDEK FINANCE" },
      { property: "og:description", content: "Connexion sécurisée à REGEDEK FINANCE." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function safeNext(n?: string) {
  return n && n.startsWith("/") && !n.startsWith("//") ? n : "/tableau-de-bord";
}

function AuthPage() {
  const { next } = useSearch({ from: "/auth" });
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState<"dg" | "financier" | "">("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    if (mode === "login") {
      if (!role) { setBusy(false); toast.error("Choisissez votre profil."); return; }
      localStorage.setItem(ACTIVE_ROLE_KEY, role);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) { toast.error("Identifiants incorrects ou compte désactivé."); return; }
      navigate({ to: safeNext(next) });
    } else {
      await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
      setBusy(false);
      toast.success("Si ce compte existe, un e-mail de récupération a été envoyé.");
      setMode("login");
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <img src={logoAsset.url} alt="REGEDEK — Régie de Gestion des Déchets de Kinshasa" className="w-64 rounded-md bg-white/95 p-2" />
        <div>
          <h1 className="text-5xl font-semibold leading-tight">Trésorerie<br />sous contrôle.</h1>
          <p className="mt-6 max-w-sm text-sidebar-foreground/70">
            Régie de Gestion des Déchets de Kinshasa — recettes, dépenses, validations et justificatifs en un seul registre.
          </p>
        </div>
        <div className="text-xs text-sidebar-foreground/50">Accès réservé aux comptes autorisés.</div>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div>
            <img src={logoAsset.url} alt="REGEDEK — Régie de Gestion des Déchets de Kinshasa" className="mb-4 w-48 rounded-md bg-white/95 p-1.5 lg:hidden" />
            <h2 className="text-3xl font-semibold">{mode === "login" ? "Connexion" : "Mot de passe oublié"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">REGEDEK FINANCE</p>
          </div>
          {mode === "login" && (
            <div className="space-y-2">
              <Label>Profil</Label>
              <div className="grid grid-cols-2 gap-2">
                {([["dg", "Directrice générale"], ["financier", "Directeur financier"]] as const).map(([v, l]) => (
                  <button key={v} type="button" onClick={() => setRole(v)}
                    className={`rounded-md border p-3 text-sm ${role === v ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Adresse e-mail</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          {mode === "login" && (
            <div className="space-y-2">
              <Label htmlFor="pw">Mot de passe</Label>
              <Input id="pw" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </div>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            {mode === "login" ? "Se connecter" : "Envoyer le lien"}
          </Button>
          <button type="button" className="text-sm text-muted-foreground underline" onClick={() => setMode(mode === "login" ? "forgot" : "login")}>
            {mode === "login" ? "Mot de passe oublié ?" : "Retour à la connexion"}
          </button>
        </form>
      </div>
    </div>
  );
}
