import type { BpmnIssue } from "@workspace/api-client-react";
import { AlertCircle, AlertTriangle, CheckCircle2, ArrowRight } from "lucide-react";

interface IssuesListProps {
  issues: BpmnIssue[];
}

export function IssuesList({ issues }: IssuesListProps) {
  if (!issues || issues.length === 0) {
    return (
      <div className="text-center py-12 border border-dashed rounded-xl border-border">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 mb-4">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-medium text-foreground">No issues found</h3>
        <p className="text-sm text-muted-foreground mt-1">The process description was converted smoothly.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {issues.map((issue, idx) => (
        <div
          key={idx}
          className={`rounded-xl border p-4 space-y-2 ${
            issue.severity === 'issue'
              ? 'bg-red-50/50 border-red-100 dark:bg-red-950/20 dark:border-red-900/30'
              : 'bg-amber-50/50 border-amber-100 dark:bg-amber-950/20 dark:border-amber-900/30'
          }`}
        >
          <div className="flex items-start gap-3">
            {issue.severity === 'issue' ? (
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-500" />
            ) : (
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-500" />
            )}
            <div className="flex-1 min-w-0">
              <h4 className={`text-xs font-bold uppercase tracking-wide mb-1 ${
                issue.severity === 'issue' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
              }`}>
                {issue.severity}
              </h4>
              <p className="text-sm leading-relaxed text-foreground/90">
                {issue.description}
              </p>
            </div>
          </div>

          {issue.choiceMade && (
            <div className="ml-8 pl-3 border-l-2 border-border space-y-1.5">
              <div className="flex items-start gap-2">
                <span className="text-xs font-semibold text-muted-foreground shrink-0 mt-0.5">Choice made:</span>
                <p className="text-xs text-foreground/80 leading-relaxed">{issue.choiceMade}</p>
              </div>
              {issue.alternativeIfWrong && (
                <div className="flex items-start gap-2">
                  <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground leading-relaxed italic">{issue.alternativeIfWrong}</p>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
