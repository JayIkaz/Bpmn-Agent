import { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Check, Copy, Download } from "lucide-react";

interface XmlViewerProps {
  xml: string;
}

export function XmlViewer({ xml }: XmlViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(xml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "process.bpmn";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="relative group rounded-xl overflow-hidden border border-border/50 shadow-sm bg-[#1E1E1E]">
      <div className="absolute top-0 w-full flex justify-between items-center px-4 py-2 bg-white/5 border-b border-white/10 z-10 backdrop-blur-sm">
        <span className="text-xs font-medium text-white/50 font-mono">process.bpmn</span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="p-1.5 rounded-md hover:bg-white/10 text-white/70 hover:text-white transition-colors"
            title="Copy XML"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
          <button
            onClick={handleDownload}
            className="p-1.5 rounded-md hover:bg-white/10 text-white/70 hover:text-white transition-colors"
            title="Download .bpmn file"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="pt-10 max-h-[600px] overflow-auto">
        <SyntaxHighlighter
          language="xml"
          style={vscDarkPlus}
          customStyle={{
            margin: 0,
            padding: '1.5rem',
            background: 'transparent',
            fontSize: '0.875rem',
          }}
          codeTagProps={{
            style: { fontFamily: 'var(--font-mono)' }
          }}
        >
          {xml}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}
