import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "REGEDEK FINANCE — Trésorerie" },
      { name: "description", content: "Accès à la gestion financière de la REGEDEK." },
      { property: "og:title", content: "REGEDEK FINANCE — Trésorerie" },
      { property: "og:description", content: "Accès à la gestion financière de la REGEDEK." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/tableau-de-bord" });
  },
});
