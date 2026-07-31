/**
 * Offline smoke test for the semantic-XML + auto-layout pipeline.
 *
 * Runs the same two steps `POST /bpmn/convert` runs after the model replies —
 * `validateBpmnXml` then `layoutProcess` — against a fixed sample, so the
 * layout path can be checked without an OpenAI call.
 *
 *   pnpm --filter @workspace/api-server run verify:layout
 */
import { layoutProcess } from "bpmn-auto-layout";
import { validateBpmnXml } from "./validate-bpmn-xml.js";

/** Shaped exactly as the system prompt asks the model to shape its output. */
const SEMANTIC_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" id="definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="collab_orderFulfillment">
    <bpmn:participant id="pool_orderFulfillment" name="Order Fulfilment" processRef="process_orderFulfillment" />
  </bpmn:collaboration>
  <bpmn:process id="process_orderFulfillment" isExecutable="false">
    <bpmn:laneSet id="laneSet_1">
      <bpmn:lane id="lane_sales" name="Sales">
        <bpmn:flowNodeRef>start_orderPlaced</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>ut_reviewOrder</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>xgw_itemsInStock</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>end_orderRejected</bpmn:flowNodeRef>
      </bpmn:lane>
      <bpmn:lane id="lane_warehouse" name="Warehouse">
        <bpmn:flowNodeRef>mt_pickAndPackOrder</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>end_orderShipped</bpmn:flowNodeRef>
      </bpmn:lane>
    </bpmn:laneSet>
    <bpmn:startEvent id="start_orderPlaced" name="Order placed" />
    <bpmn:userTask id="ut_reviewOrder" name="Review order" />
    <bpmn:exclusiveGateway id="xgw_itemsInStock" name="Items in stock?" />
    <bpmn:manualTask id="mt_pickAndPackOrder" name="Pick and pack order" />
    <bpmn:endEvent id="end_orderShipped" name="Order shipped" />
    <bpmn:endEvent id="end_orderRejected" name="Order rejected" />
    <bpmn:sequenceFlow id="sf_startToReview" sourceRef="start_orderPlaced" targetRef="ut_reviewOrder" />
    <bpmn:sequenceFlow id="sf_reviewToGateway" sourceRef="ut_reviewOrder" targetRef="xgw_itemsInStock" />
    <bpmn:sequenceFlow id="sf_gatewayToPick" name="Yes" sourceRef="xgw_itemsInStock" targetRef="mt_pickAndPackOrder">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">Items in stock</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="sf_gatewayToRejected" name="No" sourceRef="xgw_itemsInStock" targetRef="end_orderRejected">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">Items not in stock</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="sf_pickToShipped" sourceRef="mt_pickAndPackOrder" targetRef="end_orderShipped" />
  </bpmn:process>
</bpmn:definitions>`;

const SHAPE_IDS = [
  "pool_orderFulfillment",
  "lane_sales",
  "lane_warehouse",
  "start_orderPlaced",
  "ut_reviewOrder",
  "xgw_itemsInStock",
  "mt_pickAndPackOrder",
  "end_orderShipped",
  "end_orderRejected",
];

const EDGE_IDS = [
  "sf_startToReview",
  "sf_reviewToGateway",
  "sf_gatewayToPick",
  "sf_gatewayToRejected",
  "sf_pickToShipped",
];

/** Each case must be rejected by validateBpmnXml, with the reason named. */
const REJECTED_CASES: Array<{ name: string; xml: string }> = [
  {
    name: "duplicate element ids",
    xml: SEMANTIC_XML.replace('id="ut_reviewOrder"', 'id="start_orderPlaced"'),
  },
  {
    name: "sequence flow pointing at a node that does not exist",
    xml: SEMANTIC_XML.replace('targetRef="ut_reviewOrder"', 'targetRef="ut_doesNotExist"'),
  },
  {
    name: "gateway with no outgoing sequence flow",
    xml: SEMANTIC_XML.replace(/<bpmn:sequenceFlow id="sf_gatewayTo[\s\S]*?<\/bpmn:sequenceFlow>/g, ""),
  },
  {
    name: "flow node claimed by two lanes",
    xml: SEMANTIC_XML.replace(
      "<bpmn:flowNodeRef>mt_pickAndPackOrder</bpmn:flowNodeRef>",
      "<bpmn:flowNodeRef>mt_pickAndPackOrder</bpmn:flowNodeRef>\n        <bpmn:flowNodeRef>ut_reviewOrder</bpmn:flowNodeRef>",
    ),
  },
  {
    name: "missing bpmn namespace declaration",
    xml: SEMANTIC_XML.replace(' xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"', ""),
  },
];

const failures: string[] = [];

function check(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ok    ${label}`);
  } else {
    console.log(`  FAIL  ${label}`);
    failures.push(label);
  }
}

async function main(): Promise<void> {
  console.log("1. validateBpmnXml accepts semantic-only XML");
  const validation = validateBpmnXml(SEMANTIC_XML);
  check(validation.valid, `sample validates (errors: ${validation.errors.join("; ") || "none"})`);

  console.log("\n2. validateBpmnXml rejects structurally broken XML");
  for (const testCase of REJECTED_CASES) {
    const result = validateBpmnXml(testCase.xml);
    check(!result.valid, `rejects ${testCase.name}`);
  }

  console.log("\n3. layoutProcess adds diagram interchange information");
  const { xml, warnings } = await layoutProcess(SEMANTIC_XML);

  check(xml.includes("<bpmndi:BPMNDiagram"), "output has a BPMNDiagram section");
  check(xml.includes("<bpmndi:BPMNPlane"), "output has a BPMNPlane");

  for (const id of SHAPE_IDS) {
    check(
      new RegExp(`<bpmndi:BPMNShape[^>]*bpmnElement="${id}"`).test(xml),
      `shape emitted for ${id}`,
    );
  }
  for (const id of EDGE_IDS) {
    check(
      new RegExp(`<bpmndi:BPMNEdge[^>]*bpmnElement="${id}"`).test(xml),
      `edge emitted for ${id}`,
    );
  }

  const waypoints = xml.match(/<di:waypoint/g)?.length ?? 0;
  check(waypoints >= EDGE_IDS.length * 2, `every edge has at least 2 waypoints (found ${waypoints})`);

  const bounds = xml.match(/<dc:Bounds/g)?.length ?? 0;
  check(bounds >= SHAPE_IDS.length, `every shape has bounds (found ${bounds})`);

  if (warnings.length > 0) {
    console.log("\n  layout warnings (not failures):");
    for (const warning of warnings) {
      console.log(`    - [${warning.code}] ${warning.message}`);
    }
  }

  console.log(
    failures.length === 0
      ? "\nAll checks passed."
      : `\n${failures.length} check(s) failed:\n${failures.map((f) => `  - ${f}`).join("\n")}`,
  );
  process.exitCode = failures.length === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error("Smoke test threw:", err);
  process.exitCode = 1;
});
