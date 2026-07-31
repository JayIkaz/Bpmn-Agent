/**
 * bpmn-auto-layout ships no type declarations and there is no
 * `@types/bpmn-auto-layout` on npm, so importing it would fail `typecheck`
 * under `noImplicitAny` (TS7016).
 *
 * Mirrors the public API of 2.0.0-alpha.2 (`lib/index.js`, `lib/LayoutError.js`,
 * `lib/LayoutWarning.js`). Keep in sync when bumping the pinned version.
 */
declare module "bpmn-auto-layout" {
  /** A layout-relevant BPMN structural error. */
  export class LayoutError extends Error {
    /** e.g. "INVALID_LANE_MEMBERSHIP", "ROUTING_FAILED", "UNSUPPORTED_ELEMENT". */
    code: string;
    elementId: string;
    relatedElementIds: string[];
  }

  /** A non-fatal layout diagnostic. */
  export class LayoutWarning extends Error {
    /** e.g. "DI_NOT_CREATED". */
    code: string;
    elementId: string;
    relatedElementIds: string[];
  }

  /**
   * Adds diagram-interchange information (shapes, bounds, edges, waypoints)
   * to semantic-only BPMN 2.0 XML. Rejects with a `LayoutError` when the
   * input is invalid or cannot be laid out.
   */
  export function layoutProcess(xml: string): Promise<{
    xml: string;
    warnings: LayoutWarning[];
  }>;
}
