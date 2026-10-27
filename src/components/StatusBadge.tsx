import { cva } from "class-variance-authority";
import { STATUS_LABEL, type OpStatus } from "@/lib/finance";

const badge = cva("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", {
  variants: {
    s: {
      brouillon: "bg-muted text-muted-foreground",
      soumise: "bg-accent text-accent-foreground",
      en_attente_complement: "bg-warning/15 text-warning",
      approuvee: "bg-secondary text-secondary-foreground ring-1 ring-primary/30",
      rejetee: "bg-destructive/15 text-destructive",
      executee: "bg-success/15 text-success",
      annulee: "bg-muted text-muted-foreground line-through",
    },
  },
});

export function StatusBadge({ status }: { status: OpStatus }) {
  return <span className={badge({ s: status })}>{STATUS_LABEL[status]}</span>;
}
