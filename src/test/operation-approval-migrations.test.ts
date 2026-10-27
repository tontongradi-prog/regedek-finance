import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationDir = join(process.cwd(), "drizzle", "migrations");
const baseSchema = readFileSync(join(migrationDir, "0000_migration.sql"), "utf8");
const statusMigration = readFileSync(
  join(migrationDir, "0004_operation_complement_status.sql"),
  "utf8",
);
const workflowMigration = readFileSync(
  join(migrationDir, "0005_operation_approval_workflow.sql"),
  "utf8",
);
const migrationJournal = JSON.parse(
  readFileSync(join(migrationDir, "meta", "_journal.json"), "utf8"),
) as { entries: { tag: string }[] };

function functionBody(sql: string, name: string) {
  const declaration = new RegExp(
    `create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
    "i",
  );
  const match = sql.match(declaration);
  if (!match) throw new Error(`Function ${name} is missing from the workflow migration.`);
  return match[0];
}

describe("DG approval database workflow", () => {
  it("supports submitting receipts, expenses and transfers without posting them", () => {
    const operationTypes = baseSchema.match(
      /create type public\.op_type as enum \(([^)]+)\)/i,
    )?.[1];
    expect(operationTypes).toContain("'recette'");
    expect(operationTypes).toContain("'depense'");
    expect(operationTypes).toContain("'transfert'");
    expect(baseSchema).toMatch(
      /create policy "fin create draft" on public\.operations[\s\S]*?status='brouillon' and created_by=auth\.uid\(\)/i,
    );

    const submit = functionBody(workflowMigration, "submit_operation");
    expect(submit).toContain("public.has_role(auth.uid(), 'financier')");
    expect(submit).toContain("op.created_by <> auth.uid()");
    expect(submit).toContain("op.status <> 'brouillon'");
    expect(submit).toContain("set status = 'soumise'");
    expect(submit).not.toMatch(/insert\s+into\s+public\.ledger_entries/i);
  });

  it("requires an active DG and forbids self-approval at the database boundary", () => {
    const roleCheck = functionBody(workflowMigration, "has_role");
    const decide = functionBody(workflowMigration, "decide_operation");
    expect(roleCheck).toMatch(/join public\.profiles p/i);
    expect(roleCheck).toContain("p.active = true");
    expect(decide).toContain("public.has_role(auth.uid(), 'dg')");
    expect(decide).toContain("op.created_by = auth.uid()");
  });

  it("requires a non-empty reason when rejecting", () => {
    const decide = functionBody(workflowMigration, "decide_operation");
    expect(decide).toMatch(/if not _approve and coalesce\(trim\(_comment\), ''\) = '' then/i);
    expect(decide).toContain("'rejetee'::public.op_status");
    expect(decide).toMatch(/decided_by\s*=\s*auth\.uid\(\)/);
    expect(decide).toMatch(/decided_at\s*=\s*now\(\)/);
    expect(decide).toContain("'old_status', op.status");
    expect(decide).toContain("'new_status', next_status");
    expect(decide).toContain("perform public.log_audit(");
  });

  it("requires a comment and records the DG decision when deferring", () => {
    const defer = functionBody(workflowMigration, "defer_operation");
    expect(defer).toContain("coalesce(trim(_comment), '') = ''");
    expect(defer).toContain("set status = 'en_attente_complement'");
    expect(defer).toContain("decided_by = auth.uid()");
    expect(defer).toContain("decided_at = now()");
    expect(defer).toContain("perform public.log_audit(");
  });

  it("only lets the financier execute an approved operation", () => {
    const execute = functionBody(workflowMigration, "execute_operation");
    expect(execute).toContain("public.has_role(auth.uid(), 'financier')");
    expect(execute).toContain("op.status <> 'approuvee'");
    expect(execute).toContain("set status = 'executee'");
    expect(execute).toMatch(/insert\s+into\s+public\.ledger_entries/i);
    expect(functionBody(workflowMigration, "decide_operation")).not.toMatch(
      /insert\s+into\s+public\.ledger_entries/i,
    );
  });

  it("does not post rejected or deferred operations and leaves approved operations unexecuted", () => {
    const execute = functionBody(workflowMigration, "execute_operation");
    const decide = functionBody(workflowMigration, "decide_operation");
    const defer = functionBody(workflowMigration, "defer_operation");
    expect(execute).toContain("op.status <> 'approuvee'");
    expect(decide).toContain("'rejetee'::public.op_status");
    expect(defer).toContain("'en_attente_complement'");
    expect(decide).not.toContain("status = 'executee'");
    expect(decide).not.toMatch(/insert\s+into\s+public\.ledger_entries/i);
  });

  it("locks decisions and execution to prevent duplicate concurrent processing", () => {
    for (const name of [
      "submit_operation",
      "decide_operation",
      "defer_operation",
      "resubmit_operation",
      "execute_operation",
    ]) {
      expect(functionBody(workflowMigration, name)).toMatch(/for update/i);
    }
    expect(workflowMigration).toContain(
      "revoke all on function public.decide_operation(uuid, boolean, text, boolean, text) from public, anon;",
    );
  });

  it("writes both transfer ledger entries in one database call", () => {
    const execute = functionBody(workflowMigration, "execute_operation");
    expect(execute).toMatch(
      /elsif op\.op_type = 'transfert' then\s+insert into public\.ledger_entries[\s\S]*?values\s*\(op\.id, src\.id,[\s\S]*?\),\s*\(op\.id, dst\.id,/i,
    );
  });

  it("preserves previous rejection history when a controlled resubmission clears the current decision", () => {
    const resubmit = functionBody(workflowMigration, "resubmit_operation");
    expect(resubmit).toContain("op.status <> 'rejetee'");
    expect(resubmit).toContain("'previous_decision_comment', op.decision_comment");
    expect(resubmit).toContain("perform public.log_audit(");
  });

  it("keeps the schema additive and makes the complement status migration repeatable", () => {
    expect(statusMigration).toMatch(/alter type public\.op_status add value if not exists/i);
    expect(workflowMigration).not.toMatch(
      /\b(drop table|truncate table|delete from public\.(operations|ledger_entries|audit_log))\b/i,
    );
    expect(workflowMigration).toContain("create table public.notifications");
    expect(workflowMigration).toContain(
      "revoke insert, update, delete, truncate on public.audit_log from anon, authenticated;",
    );
  });

  it("orders the additive status migration before the workflow that uses it", () => {
    const tags = migrationJournal.entries.map((entry) => entry.tag);
    expect(tags.indexOf("0003_document_ai_analysis")).toBeLessThan(
      tags.indexOf("0004_operation_complement_status"),
    );
    expect(tags.indexOf("0004_operation_complement_status")).toBeLessThan(
      tags.indexOf("0005_operation_approval_workflow"),
    );
  });
});
