import type { BpmnIssue } from "@workspace/api-client-react";
import { AlertCircle, AlertTriangle } from "lucide-react";

interface IssuesListProps {
  issues: BpmnIssue[];
}

export function IssuesList({ issues }: IssuesListProps) {
  if (!issues || issues.length === 0) {
    return (
      <div className="text-center py-12 border border-dashed rounded-xl border-border">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 mb-4">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
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
          className={`
            flex items-start gap-3 p-4 rounded-xl border
            ${issue.severity === 'issue' 
              ? 'bg-red-50/50 border-red-100 text-red-900 dark:bg-red-950/20 dark:border-red-900/30 dark:text-red-200' 
              : 'bg-amber-50/50 border-amber-100 text-amber-900 dark:bg-amber-950/20 dark:border-amber-900/30 dark:text-amber-200'}
          `}
        >
          {issue.severity === 'issue' ? (
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-500" />
          ) : (
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-500" />
          )}
          <div>
            <h4 className={`text-sm font-semibold capitalize ${issue.severity === 'issue' ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}>
              {issue.severity}
            </h4>
            <p className="text-sm mt-1 opacity-90 leading-relaxed">
              {issue.message}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
