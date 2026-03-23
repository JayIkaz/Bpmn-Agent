import { useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut, Maximize2, Download, MousePointer2 } from "lucide-react";

interface BpmnDiagramProps {
  xml: string;
}

export function BpmnDiagram({ xml }: BpmnDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!containerRef.current || !xml) return;

    let cancelled = false;

    const initViewer = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // NavigatedViewer supports mouse-wheel zoom + click-drag pan, like Visio
        const NavigatedViewer = (await import("bpmn-js/lib/NavigatedViewer")).default;

        if (cancelled) return;

        if (viewerRef.current) {
          viewerRef.current.destroy();
          viewerRef.current = null;
        }

        const viewer = new NavigatedViewer({
          container: containerRef.current!,
        });

        viewerRef.current = viewer;

        const { warnings } = await viewer.importXML(xml);
        if (warnings?.length) {
          console.warn("BPMN import warnings:", warnings);
        }

        if (cancelled) {
          viewer.destroy();
          return;
        }

        viewer.get("canvas").zoom("fit-viewport");
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message ?? "Failed to render diagram");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    initViewer();

    return () => {
      cancelled = true;
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, [xml]);

  const zoom = (factor: number) => {
    if (!viewerRef.current) return;
    const canvas = viewerRef.current.get("canvas");
    canvas.zoom(canvas.zoom() * factor);
  };

  const fitView = () => {
    if (!viewerRef.current) return;
    viewerRef.current.get("canvas").zoom("fit-viewport");
  };

  const downloadSvg = () => {
    if (!viewerRef.current) return;
    viewerRef.current.saveSVG().then(({ svg }: { svg: string }) => {
      const blob = new Blob([svg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "bpmn-diagram.svg";
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  return (
    <div className="relative w-full h-full flex flex-col bpmn-canvas-host">
      {/* Toolbar */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-xl p-1.5 shadow-sm">
        <button onClick={() => zoom(1.3)} className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-800" title="Zoom in">
          <ZoomIn className="w-4 h-4" />
        </button>
        <button onClick={() => zoom(0.77)} className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-800" title="Zoom out">
          <ZoomOut className="w-4 h-4" />
        </button>
        <button onClick={fitView} className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-800" title="Fit to view">
          <Maximize2 className="w-4 h-4" />
        </button>
        <div className="w-px h-5 bg-slate-200 mx-0.5" />
        <button onClick={downloadSvg} className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-800" title="Download as SVG">
          <Download className="w-4 h-4" />
        </button>
      </div>

      {/* Hint */}
      {!isLoading && !error && (
        <div className="absolute bottom-3 left-3 z-10 flex items-center gap-1.5 text-xs text-slate-400 bg-white/80 backdrop-blur-sm px-2.5 py-1.5 rounded-lg border border-slate-100">
          <MousePointer2 className="w-3 h-3" />
          Scroll to zoom · Drag to pan
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
      <div
        ref={containerRef}
        className="w-full h-full min-h-[460px] bpmn-canvas"
      />
    </div>
  );
}
