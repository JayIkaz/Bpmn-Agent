import { useEffect, useRef, useState } from "react";
import {
  ZoomIn, ZoomOut, Maximize2, Download, MousePointer2,
  Copy, X, Tag, User, Settings, Send, Mail, Scroll,
  BookOpen, Hand, Play, Square, Diamond, ClipboardCopy, ImageDown,
  Expand, Shrink,
} from "lucide-react";
import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn.css";
import "../bpmn-theme.css";

interface BpmnDiagramProps {
  xml: string;
}

interface SelectedElement {
  id: string;
  name: string;
  type: string;
  lane?: string;
  documentation?: string;
}

const BPMN_TYPE_META: Record<string, { label: string; color: string; Icon: any }> = {
  "bpmn:UserTask":         { label: "User Task",              color: "bg-blue-100 text-blue-700",   Icon: User },
  "bpmn:ServiceTask":      { label: "Service Task",           color: "bg-violet-100 text-violet-700", Icon: Settings },
  "bpmn:SendTask":         { label: "Send Task",              color: "bg-sky-100 text-sky-700",     Icon: Send },
  "bpmn:ReceiveTask":      { label: "Receive Task",           color: "bg-cyan-100 text-cyan-700",   Icon: Mail },
  "bpmn:ScriptTask":       { label: "Script Task",            color: "bg-indigo-100 text-indigo-700", Icon: Scroll },
  "bpmn:BusinessRuleTask": { label: "Business Rule Task",     color: "bg-purple-100 text-purple-700", Icon: BookOpen },
  "bpmn:ManualTask":       { label: "Manual Task",            color: "bg-orange-100 text-orange-700", Icon: Hand },
  "bpmn:Task":             { label: "Task",                   color: "bg-blue-100 text-blue-700",   Icon: Tag },
  "bpmn:ExclusiveGateway": { label: "Exclusive Gateway (XOR)", color: "bg-amber-100 text-amber-700", Icon: Diamond },
  "bpmn:ParallelGateway":  { label: "Parallel Gateway (AND)", color: "bg-amber-100 text-amber-700", Icon: Diamond },
  "bpmn:InclusiveGateway": { label: "Inclusive Gateway (OR)", color: "bg-amber-100 text-amber-700", Icon: Diamond },
  "bpmn:StartEvent":       { label: "Start Event",            color: "bg-green-100 text-green-700", Icon: Play },
  "bpmn:EndEvent":         { label: "End Event",              color: "bg-red-100 text-red-700",     Icon: Square },
  "bpmn:IntermediateCatchEvent": { label: "Intermediate Event", color: "bg-yellow-100 text-yellow-700", Icon: Play },
  "bpmn:TextAnnotation":   { label: "Annotation",             color: "bg-slate-100 text-slate-600", Icon: Tag },
};

export function BpmnDiagram({ xml }: BpmnDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState<SelectedElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!containerRef.current || !xml) return;

    let cancelled = false;

    const initViewer = async () => {
      setIsLoading(true);
      setError(null);
      setSelected(null);

      try {
        const NavigatedViewer = (await import("bpmn-js/lib/NavigatedViewer")).default;

        if (cancelled) return;

        if (viewerRef.current) {
          viewerRef.current.destroy();
          viewerRef.current = null;
        }

        const viewer = new NavigatedViewer({ container: containerRef.current! });
        viewerRef.current = viewer;

        const { warnings } = await viewer.importXML(xml);
        if (warnings?.length) console.warn("BPMN import warnings:", warnings);

        if (cancelled) { viewer.destroy(); return; }

        // bpmn-js resolves services through diagram-js's augmentable ServiceMap.
        // diagram-js is not a direct dependency here, so those augmentations are
        // not in the program and `get(name)` widens to `unknown` — narrow at the
        // call site rather than weakening the whole viewer handle.
        (viewer.get("canvas") as any).zoom("fit-viewport");

        // Click handler — show element detail panel
        viewer.on("element.click", (event: any) => {
          const el = event.element;
          const bo = el.businessObject;
          if (!bo || el.type === "bpmn:Process" || el.type === "bpmn:Collaboration") {
            setSelected(null);
            return;
          }

          // Find the parent lane name (actor)
          let lane: string | undefined;
          try {
            const elementRegistry = viewer.get("elementRegistry") as any;
            elementRegistry.forEach((shape: any) => {
              if (shape.type === "bpmn:Lane" && shape.children?.some((c: any) => c.id === el.id)) {
                lane = shape.businessObject?.name;
              }
            });
          } catch {}

          setSelected({
            id: el.id,
            name: bo.name || el.id,
            type: el.type,
            lane,
            documentation: bo.documentation?.[0]?.text,
          });
        });

        // Click on canvas background → deselect
        viewer.on("canvas.viewbox.changed", () => {});
        const canvas = (viewer.get("canvas") as any).getContainer();
        canvas.addEventListener("click", (e: MouseEvent) => {
          if ((e.target as Element)?.classList?.contains("djs-container") ||
              (e.target as SVGElement)?.tagName === "svg") {
            setSelected(null);
          }
        });

      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? "Failed to render diagram");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    initViewer();

    return () => {
      cancelled = true;
      if (viewerRef.current) { viewerRef.current.destroy(); viewerRef.current = null; }
    };
  }, [xml]);

  useEffect(() => {
    if (!isFullscreen) return;

    document.body.style.overflow = "hidden";

    const refit = () => viewerRef.current?.get("canvas").zoom("fit-viewport");
    const t = setTimeout(refit, 60);
    window.addEventListener("resize", refit);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullscreen(false);
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      clearTimeout(t);
      window.removeEventListener("resize", refit);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFullscreen]);

  const zoom = (factor: number) => {
    if (!viewerRef.current) return;
    const canvas = viewerRef.current.get("canvas");
    canvas.zoom(canvas.zoom() * factor);
  };

  const fitView = () => viewerRef.current?.get("canvas").zoom("fit-viewport");

  const downloadSvg = () => {
    viewerRef.current?.saveSVG().then(({ svg }: { svg: string }) => {
      const blob = new Blob([svg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "bpmn-diagram.svg"; a.click();
      URL.revokeObjectURL(url);
    });
  };

  const downloadPng = () => {
    viewerRef.current?.saveSVG().then(({ svg }: { svg: string }) => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svg, "image/svg+xml");
      const svgEl = doc.documentElement;

      let width = parseFloat(svgEl.getAttribute("width") || "");
      let height = parseFloat(svgEl.getAttribute("height") || "");

      if (!width || !height) {
        const viewBox = svgEl.getAttribute("viewBox");
        if (viewBox) {
          const parts = viewBox.split(/\s+/).map(Number);
          width = width || parts[2];
          height = height || parts[3];
        }
      }

      width = width || 800;
      height = height || 600;

      const scale = 2;
      const svgString = new XMLSerializer().serializeToString(svgEl);
      const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext("2d");
        if (!ctx) { URL.revokeObjectURL(url); return; }
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);

        canvas.toBlob((blob) => {
          if (!blob) return;
          const pngUrl = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = pngUrl;
          a.download = "bpmn-diagram.png";
          a.click();
          URL.revokeObjectURL(pngUrl);
        }, "image/png");
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
      };
      img.src = url;
    });
  };

  const copySvg = () => {
    viewerRef.current?.saveSVG().then(({ svg }: { svg: string }) => {
      navigator.clipboard.writeText(svg).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    });
  };

  const meta = selected ? (BPMN_TYPE_META[selected.type] ?? { label: selected.type.replace("bpmn:", ""), color: "bg-slate-100 text-slate-600", Icon: Tag }) : null;

  return (
    <div
      className={
        isFullscreen
          ? "fixed inset-0 z-[100] flex flex-col bpmn-canvas-host bg-white"
          : "relative w-full h-full flex flex-col bpmn-canvas-host"
      }
    >

      {/* Toolbar */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-xl p-1.5 shadow-sm">
        <button onClick={() => zoom(1.3)} className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-800" title="Zoom in"><ZoomIn className="w-4 h-4" /></button>
        <button onClick={() => zoom(0.77)} className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-800" title="Zoom out"><ZoomOut className="w-4 h-4" /></button>
        <button onClick={fitView} className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-800" title="Fit to view"><Maximize2 className="w-4 h-4" /></button>
        <div className="w-px h-5 bg-slate-200 mx-0.5" />
        <button onClick={copySvg} className={`p-2 rounded-lg transition-colors ${copied ? "bg-green-100 text-green-600" : "hover:bg-slate-100 text-slate-500 hover:text-slate-800"}`} title="Copy SVG to clipboard">
          {copied ? <ClipboardCopy className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        </button>
        <button onClick={downloadSvg} className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-800" title="Download SVG"><Download className="w-4 h-4" /></button>
        <button onClick={downloadPng} className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-800" title="Download PNG"><ImageDown className="w-4 h-4" /></button>
        <div className="w-px h-5 bg-slate-200 mx-0.5" />
        <button
          onClick={() => setIsFullscreen((f) => !f)}
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-800"
          title={isFullscreen ? "Exit full screen" : "Full screen"}
        >
          {isFullscreen ? <Shrink className="w-4 h-4" /> : <Expand className="w-4 h-4" />}
        </button>
      </div>

      {/* Hint */}
      {!isLoading && !error && (
        <div className="absolute bottom-3 left-3 z-10 flex items-center gap-1.5 text-xs text-slate-400 bg-white/80 backdrop-blur-sm px-2.5 py-1.5 rounded-lg border border-slate-100">
          <MousePointer2 className="w-3 h-3" />
          Click element for details · Scroll to zoom · Drag to pan
        </div>
      )}

      {/* Element detail panel */}
      {selected && meta && (
        <div className="absolute bottom-12 left-3 z-20 w-72 bg-white rounded-2xl border border-slate-200 shadow-xl shadow-black/10 p-4 animate-in slide-in-from-bottom-3 duration-200">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${meta.color}`}>
              <meta.Icon className="w-3.5 h-3.5" />
              {meta.label}
            </div>
            <button onClick={() => setSelected(null)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="font-semibold text-slate-800 text-sm leading-snug">{selected.name || "(unnamed)"}</p>
          {selected.lane && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
              <User className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Actor: <span className="font-medium text-slate-700">{selected.lane}</span></span>
            </div>
          )}
          {selected.documentation && (
            <p className="mt-2 text-xs text-slate-500 leading-relaxed border-t border-slate-100 pt-2">{selected.documentation}</p>
          )}
          <p className="mt-2 text-[10px] text-slate-300 font-mono">{selected.id}</p>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50/80 z-20 rounded-xl">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-500">Rendering diagram...</p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="text-center px-6">
            <p className="text-sm text-red-600 font-medium">Failed to render diagram</p>
            <p className="text-xs text-slate-500 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* bpmn-js canvas */}
      <div ref={containerRef} className="w-full h-full min-h-[460px] bpmn-canvas" />
    </div>
  );
}
