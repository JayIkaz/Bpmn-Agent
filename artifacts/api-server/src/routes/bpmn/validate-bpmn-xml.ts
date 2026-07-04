import { XMLParser, XMLValidator } from "fast-xml-parser";

export interface BpmnValidationResult {
  valid: boolean;
  errors: string[];
}

const REQUIRED_NAMESPACES = [
  "xmlns:bpmn",
  "xmlns:bpmndi",
  "xmlns:dc",
  "xmlns:di",
];

const FLOW_NODE_TAG_SUFFIXES = [
  "task",
  "userTask",
  "serviceTask",
  "manualTask",
  "receiveTask",
  "sendTask",
  "scriptTask",
  "businessRuleTask",
  "startEvent",
  "endEvent",
  "intermediateCatchEvent",
  "intermediateThrowEvent",
  "boundaryEvent",
  "exclusiveGateway",
  "parallelGateway",
  "inclusiveGateway",
  "eventBasedGateway",
  "complexGateway",
  "subProcess",
];

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function localName(tag: string): string {
  return tag.includes(":") ? tag.split(":")[1] : tag;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function num(v: unknown): number | null {
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function getShapeBounds(shape: any): Rect | null {
  const b = shape?.["dc:Bounds"] ?? shape?.["Bounds"];
  if (!b) return null;
  const x = num(b["@_x"]);
  const y = num(b["@_y"]);
  const width = num(b["@_width"]);
  const height = num(b["@_height"]);
  if (x == null || y == null || width == null || height == null) return null;
  return { x, y, width, height };
}

/**
 * Validates BPMN 2.0 XML for the structural requirements the system prompt
 * demands. This is intentionally conservative: it only flags issues that
 * would cause bpmn-js to render a blank/broken canvas, not stylistic
 * deviations from the naming convention.
 */
export function validateBpmnXml(xml: string): BpmnValidationResult {
  const errors: string[] = [];

  if (!xml || !xml.trim()) {
    return { valid: false, errors: ["The AI returned empty BPMN XML."] };
  }

  const wellFormed = XMLValidator.validate(xml, {
    allowBooleanAttributes: true,
  });
  if (wellFormed !== true) {
    const msg =
      typeof wellFormed === "object" && wellFormed.err
        ? `${wellFormed.err.msg} (line ${wellFormed.err.line}, col ${wellFormed.err.col})`
        : "Unknown XML syntax error";
    return { valid: false, errors: [`XML is not well-formed: ${msg}`] };
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    preserveOrder: false,
    parseAttributeValue: false,
    trimValues: true,
  });

  let doc: any;
  try {
    doc = parser.parse(xml);
  } catch (err) {
    return {
      valid: false,
      errors: [`Failed to parse XML: ${err instanceof Error ? err.message : String(err)}`],
    };
  }

  const definitions = doc["bpmn:definitions"] ?? doc["definitions"];
  if (!definitions) {
    return {
      valid: false,
      errors: ["Missing root <bpmn:definitions> element."],
    };
  }

  for (const ns of REQUIRED_NAMESPACES) {
    if (!definitions[`@_${ns}`]) {
      errors.push(`Missing required namespace declaration: ${ns}`);
    }
  }

  const processes = asArray(definitions["bpmn:process"] ?? definitions["process"]);
  if (processes.length === 0) {
    errors.push("No <bpmn:process> element found.");
  }

  const allIds: string[] = [];
  const flowNodeIds = new Set<string>();
  const sequenceFlowIds = new Set<string>();

  for (const process of processes) {
    for (const key of Object.keys(process)) {
      if (key.startsWith("@_")) continue;
      const tagLocal = localName(key);
      const items = asArray(process[key]);
      for (const item of items) {
        if (item == null || typeof item !== "object") continue;
        const id = item["@_id"];
        if (id) {
          allIds.push(id);
          if (tagLocal === "sequenceFlow") {
            sequenceFlowIds.add(id);
          } else if (FLOW_NODE_TAG_SUFFIXES.includes(tagLocal)) {
            flowNodeIds.add(id);
          }
        }
      }
    }
  }

  if (flowNodeIds.size === 0) {
    errors.push("No flow nodes (tasks, events, or gateways) found in the process.");
  }

  const duplicateIds = allIds.filter((id, idx) => allIds.indexOf(id) !== idx);
  if (duplicateIds.length > 0) {
    errors.push(
      `Duplicate element IDs found (must be unique): ${[...new Set(duplicateIds)].join(", ")}`,
    );
  }

  const bpmndiagram =
    definitions["bpmndi:BPMNDiagram"] ?? definitions["BPMNDiagram"];
  if (!bpmndiagram) {
    errors.push("Missing <bpmndi:BPMNDiagram> section — the diagram cannot be rendered.");
  } else {
    const plane = bpmndiagram["bpmndi:BPMNPlane"] ?? bpmndiagram["BPMNPlane"];
    if (!plane) {
      errors.push("Missing <bpmndi:BPMNPlane> inside BPMNDiagram.");
    } else {
      const shapes = asArray(plane["bpmndi:BPMNShape"] ?? plane["BPMNShape"]);
      const edges = asArray(plane["bpmndi:BPMNEdge"] ?? plane["BPMNEdge"]);

      const shapeElementRefs = new Set(
        shapes.map((s) => s["@_bpmnElement"]).filter(Boolean),
      );
      const edgeElementRefs = new Set(
        edges.map((e) => e["@_bpmnElement"]).filter(Boolean),
      );

      for (const id of flowNodeIds) {
        if (!shapeElementRefs.has(id)) {
          errors.push(`Flow node "${id}" is missing a corresponding <bpmndi:BPMNShape>.`);
        }
      }

      for (const id of sequenceFlowIds) {
        if (!edgeElementRefs.has(id)) {
          errors.push(`Sequence flow "${id}" is missing a corresponding <bpmndi:BPMNEdge>.`);
        }
      }

      for (const shape of shapes) {
        const bounds = shape["dc:Bounds"] ?? shape["Bounds"];
        if (!bounds) {
          errors.push(
            `Shape for "${shape["@_bpmnElement"] ?? "unknown element"}" is missing <dc:Bounds>.`,
          );
        }
      }

      for (const edge of edges) {
        const waypoints = asArray(edge["di:waypoint"] ?? edge["waypoint"]);
        if (waypoints.length < 2) {
          errors.push(
            `Edge for "${edge["@_bpmnElement"] ?? "unknown flow"}" has fewer than 2 waypoints.`,
          );
        }
      }

      // Geometric check: every flow node must be fully contained within the
      // bounds of the lane it belongs to. This catches the common failure
      // mode where the AI's flow-position math overflows the pool/lane
      // width or height, causing elements to render outside the swimlanes.
      const laneFlowNodeMap = new Map<string, string>();
      for (const process of processes) {
        const laneSets = asArray(process["bpmn:laneSet"] ?? process["laneSet"]);
        for (const laneSet of laneSets) {
          const lanes = asArray(laneSet["bpmn:lane"] ?? laneSet["lane"]);
          for (const lane of lanes) {
            const laneId = lane["@_id"];
            if (!laneId) continue;
            const refs = asArray(lane["bpmn:flowNodeRef"] ?? lane["flowNodeRef"]);
            for (const ref of refs) {
              const refId = typeof ref === "string" ? ref : (ref as any)?.["#text"];
              if (refId) laneFlowNodeMap.set(refId, laneId);
            }
          }
        }
      }

      if (laneFlowNodeMap.size > 0) {
        const boundsByElementId = new Map<string, Rect>();
        for (const shape of shapes) {
          const ref = shape["@_bpmnElement"];
          const rect = getShapeBounds(shape);
          if (ref && rect) boundsByElementId.set(ref, rect);
        }

        const TOLERANCE = 2;
        const overflowIds: string[] = [];
        for (const [nodeId, laneId] of laneFlowNodeMap) {
          const nodeRect = boundsByElementId.get(nodeId);
          const laneRect = boundsByElementId.get(laneId);
          if (!nodeRect || !laneRect) continue;

          const fitsHorizontally =
            nodeRect.x >= laneRect.x - TOLERANCE &&
            nodeRect.x + nodeRect.width <= laneRect.x + laneRect.width + TOLERANCE;
          const fitsVertically =
            nodeRect.y >= laneRect.y - TOLERANCE &&
            nodeRect.y + nodeRect.height <= laneRect.y + laneRect.height + TOLERANCE;

          if (!fitsHorizontally || !fitsVertically) {
            overflowIds.push(nodeId);
          }
        }

        if (overflowIds.length > 0) {
          errors.push(
            `The following elements render outside the bounds of their swimlane: ${overflowIds.join(", ")}. Every element's shape (and the pool/lane width and height) must be recomputed so all flow nodes are fully contained within their assigned lane, with no overflow.`,
          );
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
