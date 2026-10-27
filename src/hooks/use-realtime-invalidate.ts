import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useRealtimeInvalidate(keys: string[][]) {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase
      .channel(`rt-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "operations" }, () =>
        keys.forEach((k) => qc.invalidateQueries({ queryKey: k })),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "documents" }, () =>
        keys.forEach((k) => qc.invalidateQueries({ queryKey: k })),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () =>
        keys.forEach((k) => qc.invalidateQueries({ queryKey: k })),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
