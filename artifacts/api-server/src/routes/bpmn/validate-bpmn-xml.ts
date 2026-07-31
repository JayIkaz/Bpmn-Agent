import { XMLParser, XMLValidator } from "fast-xml-parser";

export interface BpmnValidationResult {
  valid: boolean;
  errors: string[];
}

// Only bpmn: is required. The model emits a semantic model with no
// diagram-interchange information: the bpmndi/dc/di namespaces, bounds and
// waypoints are added afterwards by bpmn-auto-layout, so nothing about them
// is checked here.
const REQUIRED_NAMESPACES = ["xmlns:bpmn"];

const GATEWAY_TAG_SUFFIXES = [
  "exclusiveGateway",
  "parallelGateway",
  "inclusiveGateway",
  "eventBasedGateway",
  "complexGateway",
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
  "callActivity",
  "startEvent",
  "endEvent",
  "intermediateCatchEvent",
  "intermediateThrowEvent",
  "boundaryEvent",
  "subProcess",
  "transaction",
  "adHocSubProcess",
  ...GATEWAY_TAG_SUFFIXES,
];

// Elements that hold flow elements of their own, and so form a scope that a
// sequence flow may not cross.
const SCOPE_TAG_SUFFIXES = ["subProcess", "transaction", "adHocSubProcess"];

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function localName(tag: string): string {
  return tag.includes(":") ? tag.split(":")[1] : tag;
}

function isElement(value: unknown): value is Record<string, any> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

/** Direct child elements of `node`, as [localName, element] pairs. */
function children(node: Record<string, any>): Array<[string, Record<string, any>]> {
  const result: Array<[string, Record<string, any>]> = [];
  for (const key of Object.keys(node)) {
    if (key.startsWith("@_") || key === "#text") continue;
    for (const item of asArray(node[key])) {
      if (isElement(item)) result.push([localName(key), item]);
    }
  }
  return result;
}

/** Every id attribute in the document, including duplicates. */
function collectIds(node: Record<string, any>, into: string[]): void {
  const id = node["@_id"];
  if (typeof id === "string" && id) into.push(id);
  for (const [, child] of children(node)) collectIds(child, into);
}

interface LaneRecord {
  id: string;
  /** Ids of every lane this lane is nested inside. */
  ancestors: Set<string>;
  nodeRefs: string[];
}

/** Flattens a laneSet tree, recording nesting so ancestor memberships stay legal. */
function collectLanes(
  scope: Record<string, any>,
  ancestors: Set<string>,
  into: LaneRecord[],
): void {
  // A process holds a <laneSet>; a lane nests further lanes under <childLaneSet>.
  for (const [tag, laneSet] of children(scope)) {
    if (tag !== "laneSet" && tag !== "childLaneSet") continue;
    for (const [laneTag, lane] of children(laneSet)) {
      if (laneTag !== "lane") continue;
      const id = typeof lane["@_id"] === "string" ? lane["@_id"] : "";
      const nodeRefs: string[] = [];
      for (const key of Object.keys(lane)) {
        if (localName(key) !== "flowNodeRef") continue;
        for (const ref of asArray(lane[key])) {
          // A bare <bpmn:flowNodeRef>id</bpmn:flowNodeRef> parses to a string;
          // one carrying attributes parses to an object with a #text value.
          const value = typeof ref === "string" ? ref : isElement(ref) ? ref["#text"] : undefined;
          if (typeof value === "string" && value) nodeRefs.push(value);
        }
      }
      into.push({ id, ancestors, nodeRefs });
      collectLanes(lane, id ? new Set([...ancestors, id]) : ancestors, into);
    }
  }
}

interface Scope {
  id: string;
  flowNodeIds: Set<string>;
  gatewayIds: Set<string>;
  sequenceFlows: Array<{ id: string; sourceRef: string; targetRef: string }>;
}

/** A process or sub-process, plus every sub-process nested inside it. */
function collectScopes(node: Record<string, any>, into: Scope[]): void {
  const scope: Scope = {
    id: typeof node["@_id"] === "string" ? node["@_id"] : "(unnamed)",
    flowNodeIds: new Set(),
    gatewayIds: new Set(),
    sequenceFlows: [],
  };
  into.push(scope);

  for (const [tag, child] of children(node)) {
    const id = typeof child["@_id"] === "string" ? child["@_id"] : "";

    if (tag === "sequenceFlow") {
      scope.sequenceFlows.push({
        id: id || "(unnamed flow)",
        sourceRef: String(child["@_sourceRef"] ?? ""),
        targetRef: String(child["@_targetRef"] ?? ""),
      });
      continue;
    }

    if (FLOW_NODE_TAG_SUFFIXES.includes(tag)) {
      if (id) {
        scope.flowNodeIds.add(id);
        if (GATEWAY_TAG_SUFFIXES.includes(tag)) scope.gatewayIds.add(id);
      }
      if (SCOPE_TAG_SUFFIXES.includes(tag)) collectScopes(child, into);
    }
  }
}

/**
 * Validates the structural requirements the system prompt demands of the
 * semantic BPMN model. It deliberately checks only what would break rendering
 * or make bpmn-auto-layout throw — never geometry or style, which are the
 * layout engine's responsibility, and never stylistic deviations from the
 * naming convention.
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
    // Element ids are opaque strings; never coerce a flowNodeRef to a number.
    parseTagValue: false,
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

  const definitionsKey = Object.keys(doc).find((key) => localName(key) === "definitions");
  const definitions = definitionsKey ? doc[definitionsKey] : undefined;
  if (!isElement(definitions)) {
    return { valid: false, errors: ["Missing root <bpmn:definitions> element."] };
  }

  for (const ns of REQUIRED_NAMESPACES) {
    if (!definitions[`@_${ns}`]) {
      errors.push(`Missing required namespace declaration: ${ns}`);
    }
  }

  const processes = children(definitions)
    .filter(([tag]) => tag === "process")
    .map(([, element]) => element);

  if (processes.length === 0) {
    errors.push("No <bpmn:process> element found.");
  }

  const scopes: Scope[] = [];
  const lanes: LaneRecord[] = [];
  for (const process of processes) {
    collectScopes(process, scopes);
    collectLanes(process, new Set(), lanes);
  }

  const allFlowNodeIds = new Set(scopes.flatMap((scope) => [...scope.flowNodeIds]));
  if (allFlowNodeIds.size === 0) {
    errors.push("No flow nodes (tasks, events, or gateways) found in the process.");
  }

  const allIds: string[] = [];
  collectIds(definitions, allIds);
  const duplicateIds = allIds.filter((id, idx) => allIds.indexOf(id) !== idx);
  if (duplicateIds.length > 0) {
    errors.push(
      `Duplicate element IDs found (must be unique): ${[...new Set(duplicateIds)].join(", ")}`,
    );
  }

  for (const scope of scopes) {
    // bpmn-auto-layout builds its graph purely from sourceRef/targetRef and
    // throws (a hard 500) on a dangling or scope-crossing endpoint, so
    // catching it here lets the retry fix it instead.
    for (const flow of scope.sequenceFlows) {
      for (const [role, ref] of [
        ["sourceRef", flow.sourceRef],
        ["targetRef", flow.targetRef],
      ] as const) {
        if (!ref) {
          errors.push(`Sequence flow "${flow.id}" is missing a ${role}.`);
        } else if (!scope.flowNodeIds.has(ref)) {
          errors.push(
            `Sequence flow "${flow.id}" has a ${role} of "${ref}", which is not a flow node declared in "${scope.id}". A sequence flow cannot cross into another process or sub-process.`,
          );
        }
      }
    }

    // Gateway flow counts. A gateway missing an incoming or outgoing flow
    // leaves a dead end in the diagram.
    for (const gatewayId of scope.gatewayIds) {
      const incoming = scope.sequenceFlows.filter((flow) => flow.targetRef === gatewayId).length;
      const outgoing = scope.sequenceFlows.filter((flow) => flow.sourceRef === gatewayId).length;
      if (incoming === 0 || outgoing === 0) {
        errors.push(
          `Gateway "${gatewayId}" has ${incoming} incoming and ${outgoing} outgoing sequence flow(s); every gateway needs at least one of each.`,
        );
      }
    }
  }

  // Lane membership. bpmn-auto-layout requires each flow node to have a single
  // deepest lane and rejects a node claimed by two sibling lanes. Membership in
  // both a lane and one of its ancestors is legal, so it is left alone.
  const lanesByNode = new Map<string, LaneRecord[]>();
  for (const lane of lanes) {
    for (const ref of lane.nodeRefs) {
      if (!allFlowNodeIds.has(ref)) {
        errors.push(
          `Lane "${lane.id}" lists "${ref}" as a flowNodeRef, but no flow node with that ID exists.`,
        );
        continue;
      }
      lanesByNode.set(ref, [...(lanesByNode.get(ref) ?? []), lane]);
    }
  }

  for (const [nodeId, memberships] of lanesByNode) {
    if (memberships.length < 2) continue;
    const deepest = memberships.filter(
      (lane) => !memberships.some((other) => other.ancestors.has(lane.id)),
    );
    if (deepest.length > 1) {
      errors.push(
        `Flow node "${nodeId}" belongs to more than one lane (${deepest.map((lane) => lane.id).join(", ")}); each flow node must be listed in exactly one lane.`,
      );
    }
  }

  return { valid: errors.length === 0, errors };
}
