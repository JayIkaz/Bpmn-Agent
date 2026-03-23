import type { BpmnElementMapping } from "@workspace/api-client-react";

interface MappingTableProps {
  mapping: BpmnElementMapping[];
}

export function MappingTable({ mapping }: MappingTableProps) {
  if (!mapping || mapping.length === 0) {
    return (
      <div className="text-center py-12 border border-dashed rounded-xl border-border">
        <p className="text-muted-foreground">No element mapping available.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th className="px-4 py-3 font-semibold text-foreground">Original Step</th>
              <th className="px-4 py-3 font-semibold text-foreground">BPMN Element</th>
              <th className="px-4 py-3 font-semibold text-foreground">Type</th>
              <th className="px-4 py-3 font-semibold text-foreground">Actor / Lane</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {mapping.map((row, idx) => (
              <tr key={idx} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 align-top text-muted-foreground max-w-xs truncate" title={row.step}>
                  {row.step}
                </td>
                <td className="px-4 py-3 align-top font-mono text-xs text-primary/90">
                  {row.bpmnElement}
                  <div className="text-[10px] text-muted-foreground/60 mt-0.5">{row.elementId}</div>
                </td>
                <td className="px-4 py-3 align-top">
                  <span className="inline-flex items-center px-2 py-1 rounded-md bg-secondary text-secondary-foreground text-xs font-medium">
                    {row.type}
                  </span>
                </td>
                <td className="px-4 py-3 align-top text-foreground font-medium">
                  {row.actor || "System"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
