import { useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut, Maximize2, Download } from "lucide-react";

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
        const BpmnJS = (await import("bpmn-js")).default;

        if (cancelled) return;

        // Destroy previous viewer instance
        if (viewerRef.current) {
          viewerRef.current.destroy();
          viewerRef.current = null;
        }

        const viewer = new BpmnJS({
          container: containerRef.current!,
        });

        viewerRef.current = viewer;

        await viewer.importXML(xml);

        if (cancelled) {
          viewer.destroy();
          return;
        }

        const canvas = viewer.get("canvas");
        canvas.zoom("fit-viewport");
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

  const handleZoomIn = () => {
    if (!viewerRef.current) return;
    const canvas = viewerRef.current.get("canvas");
    canvas.zoom(canvas.zoom() * 1.25);
  };

  const handleZoomOut = () => {
    if (!viewerRef.current) return;
    const canvas = viewerRef.current.get("canvas");
    canvas.zoom(canvas.zoom() * 0.8);
  };

  const handleFitView = () => {
    if (!viewerRef.current) return;
    const canvas = viewerRef.current.get("canvas");
    canvas.zoom("fit-viewport");
  };

  const handleDownloadSvg = () => {
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
    <div className="relative w-full h-full flex flex-col">
      {/* Toolbar */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 bg-background/90 backdrop-blur-sm border border-border rounded-xl p-1.5 shadow-sm">
        <button
          onClick={handleZoomIn}
          className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          title="Zoom in"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={handleZoomOut}
          className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          title="Zoom out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={handleFitView}
          className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          title="Fit to view"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
        <div className="w-px h-5 bg-border mx-0.5" />
        <button
          onClick={handleDownloadSvg}
          className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          title="Download as SVG"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-20 rounded-xl">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Rendering diagram...</p>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="text-center px-6">
            <p className="text-sm text-destructive font-medium">Failed to render diagram</p>
            <p className="text-xs text-muted-foreground mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* bpmn-js container */}
      <div
        ref={containerRef}
        className="w-full h-full min-h-[460px]"
        style={{ background: "transparent" }}
      />
    </div>
  );
}
