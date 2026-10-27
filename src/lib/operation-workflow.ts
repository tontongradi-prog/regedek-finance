import { supabase } from "@/integrations/supabase/client";

export function submitOperation(id: string) {
  return supabase.rpc("submit_operation", { _id: id });
}

export function decideOperation(
  id: string,
  approve: boolean,
  comment: string,
  override = false,
  overrideReason = "",
) {
  return supabase.rpc("decide_operation", {
    _id: id,
    _approve: approve,
    _comment: comment,
    _override: override,
    _override_reason: overrideReason,
  });
}

export function deferOperation(id: string, comment: string) {
  return supabase.rpc("defer_operation", { _id: id, _comment: comment });
}

export function resubmitOperation(id: string) {
  return supabase.rpc("resubmit_operation", { _id: id });
}

export function executeOperation(id: string) {
  return supabase.rpc("execute_operation", { _id: id });
}
