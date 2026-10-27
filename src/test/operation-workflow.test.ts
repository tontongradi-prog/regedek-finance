import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: rpcMock },
}));

import {
  decideOperation,
  deferOperation,
  executeOperation,
  resubmitOperation,
  submitOperation,
} from "@/lib/operation-workflow";

describe("operation workflow RPC client", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    rpcMock.mockResolvedValue({ data: null, error: null });
  });

  it("submits an existing operation, regardless of type, to the DG approval queue", async () => {
    await submitOperation("operation-id");
    expect(rpcMock).toHaveBeenCalledWith("submit_operation", { _id: "operation-id" });
  });

  it("requests DG approval", async () => {
    await decideOperation("operation-id", true, "");
    expect(rpcMock).toHaveBeenCalledWith("decide_operation", {
      _id: "operation-id",
      _approve: true,
      _comment: "",
      _override: false,
      _override_reason: "",
    });
  });

  it("sends a rejection reason to the secured DG decision RPC", async () => {
    await decideOperation("operation-id", false, "Justificatif manquant");
    expect(rpcMock).toHaveBeenCalledWith("decide_operation", {
      _id: "operation-id",
      _approve: false,
      _comment: "Justificatif manquant",
      _override: false,
      _override_reason: "",
    });
  });

  it("sends a complement request to the secured DG RPC", async () => {
    await deferOperation("operation-id", "Joindre le reçu signé");
    expect(rpcMock).toHaveBeenCalledWith("defer_operation", {
      _id: "operation-id",
      _comment: "Joindre le reçu signé",
    });
  });

  it("keeps resubmission and execution as distinct RPC actions", async () => {
    await resubmitOperation("operation-id");
    await executeOperation("operation-id");
    expect(rpcMock).toHaveBeenNthCalledWith(1, "resubmit_operation", { _id: "operation-id" });
    expect(rpcMock).toHaveBeenNthCalledWith(2, "execute_operation", { _id: "operation-id" });
  });

  it("propagates Supabase errors instead of claiming a decision succeeded", async () => {
    const failure = new Error("Supabase indisponible");
    rpcMock.mockRejectedValueOnce(failure);
    await expect(decideOperation("operation-id", true, "")).rejects.toBe(failure);
  });
});
