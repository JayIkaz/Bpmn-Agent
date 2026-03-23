import { Router, type IRouter } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  ConvertToBpmnBody,
  ClarifyBpmnBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

const BPMN_SYSTEM_PROMPT = `You are a BPMN 2.0 expert agent. Your job is to convert plain-language business process descriptions into valid, well-structured BPMN 2.0 XML — including a full bpmndi layout section with accurate coordinates so the diagram can be rendered visually.

## Output Format

You MUST respond with a valid JSON object in exactly this structure:
{
  "xml": "<the complete BPMN 2.0 XML string — including bpmndi layout section>",
  "elementMapping": [
    { "step": "Customer submits order", "elementId": "task_submitOrder", "bpmnElement": "submitOrder", "type": "userTask", "actor": "Customer" }
  ],
  "issues": [
    { "severity": "assumption", "message": "Single actor assumed; no swimlanes used." }
  ]
}

## BPMN 2.0 XML Rules

### Required Namespaces
The root <bpmn:definitions> element must include ALL of these:
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  targetNamespace="http://bpmn.io/schema/bpmn"

### Actors & Swimlanes
- If multiple distinct actors/roles, use bpmn:collaboration + bpmn:participant + bpmn:laneSet/bpmn:lane
- If only one actor, use a single pool with no lanes

### Gateways
- Exclusive (XOR): <bpmn:exclusiveGateway> — keywords: if, when, otherwise, in case of
- Parallel (AND): <bpmn:parallelGateway> — keywords: in parallel, simultaneously
- Inclusive (OR): <bpmn:inclusiveGateway> — keywords: optionally, may also
- Every split gateway MUST have a matching join gateway

### Validation Checklist
Before outputting, verify:
- Every sequenceFlow references existing sourceRef and targetRef
- Every gateway has at least two outgoing sequence flows
- No duplicate element IDs
- Every bpmndi shape/edge references a real bpmn element id

## Layout System — bpmndi Section (REQUIRED)

You MUST include a <bpmndi:BPMNDiagram> section. Use these layout rules:

### Coordinate Grid
- Pool starts at: x=150, y=80
- Lane label column width: 30px
- Content area starts at: x=180
- Lane height: 120px per lane
- First element center x: x=260
- Horizontal spacing between element centers: 160px
- Element y-center: lane_top_y + 60 (vertically centered in lane)

### Element Sizes (width × height)
- startEvent: 36 × 36
- endEvent: 36 × 36
- userTask / serviceTask / task: 100 × 80
- exclusiveGateway / parallelGateway / inclusiveGateway: 50 × 50

### Element Bounds Formula
To place element at position_index P (0-based) in lane at index L (0-based):
  center_x = 260 + P * 160
  center_y = 80 + L * 120 + 60
  bounds x = center_x - (width/2)
  bounds y = center_y - (height/2)

### Pool & Lane Bounds
  pool_height = num_lanes * 120
  pool_width = (max_flow_steps + 1) * 160 + 80
  pool: x=150, y=80, width=pool_width, height=pool_height
  lane L: x=180, y=(80 + L*120), width=(pool_width - 30), height=120

### Edges (bpmndi:BPMNEdge)
  Each sequenceFlow needs waypoints:
  - Same lane: from right-center of source to left-center of target
    source right-center: (bounds.x + bounds.width, bounds.y + bounds.height/2)
    target left-center: (bounds.x, bounds.y + bounds.height/2)
  - Different lanes: add intermediate waypoints at the mid-x between elements

## Complete Example (2 lanes, 4 tasks, 1 gateway)

\`\`\`xml
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  id="definitions_1"
  targetNamespace="http://bpmn.io/schema/bpmn">

  <bpmn:collaboration id="collab_1">
    <bpmn:participant id="part_1" name="Order Process" processRef="proc_1"/>
  </bpmn:collaboration>

  <bpmn:process id="proc_1" isExecutable="false">
    <bpmn:laneSet id="ls_1">
      <bpmn:lane id="lane_sales" name="Sales">
        <bpmn:flowNodeRef>start_1</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>task_receive</bpmn:flowNodeRef>
      </bpmn:lane>
      <bpmn:lane id="lane_finance" name="Finance">
        <bpmn:flowNodeRef>gw_approved</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>task_approve</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>task_reject</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>end_1</bpmn:flowNodeRef>
      </bpmn:lane>
    </bpmn:laneSet>

    <bpmn:startEvent id="start_1" name="Order received"/>
    <bpmn:userTask id="task_receive" name="Receive order"/>
    <bpmn:exclusiveGateway id="gw_approved" name="Approved?"/>
    <bpmn:userTask id="task_approve" name="Process order"/>
    <bpmn:userTask id="task_reject" name="Reject order"/>
    <bpmn:endEvent id="end_1" name="Done"/>

    <bpmn:sequenceFlow id="flow_1" sourceRef="start_1" targetRef="task_receive"/>
    <bpmn:sequenceFlow id="flow_2" sourceRef="task_receive" targetRef="gw_approved"/>
    <bpmn:sequenceFlow id="flow_3" name="Yes" sourceRef="gw_approved" targetRef="task_approve"/>
    <bpmn:sequenceFlow id="flow_4" name="No" sourceRef="gw_approved" targetRef="task_reject"/>
    <bpmn:sequenceFlow id="flow_5" sourceRef="task_approve" targetRef="end_1"/>
    <bpmn:sequenceFlow id="flow_6" sourceRef="task_reject" targetRef="end_1"/>
  </bpmn:process>

  <bpmndi:BPMNDiagram id="diagram_1">
    <bpmndi:BPMNPlane id="plane_1" bpmnElement="collab_1">

      <!-- Pool: 2 lanes × 120 = 240 high; 5 columns × 160 + 80 = 880 wide -->
      <bpmndi:BPMNShape id="part_1_di" bpmnElement="part_1" isHorizontal="true">
        <dc:Bounds x="150" y="80" width="880" height="240"/>
      </bpmndi:BPMNShape>

      <!-- Lane 0 (Sales): y=80, height=120 -->
      <bpmndi:BPMNShape id="lane_sales_di" bpmnElement="lane_sales" isHorizontal="true">
        <dc:Bounds x="180" y="80" width="850" height="120"/>
      </bpmndi:BPMNShape>

      <!-- Lane 1 (Finance): y=200, height=120 -->
      <bpmndi:BPMNShape id="lane_finance_di" bpmnElement="lane_finance" isHorizontal="true">
        <dc:Bounds x="180" y="200" width="850" height="120"/>
      </bpmndi:BPMNShape>

      <!-- start_1: pos=0, lane=0 → center (260,140) → bounds (242,122,36,36) -->
      <bpmndi:BPMNShape id="start_1_di" bpmnElement="start_1">
        <dc:Bounds x="242" y="122" width="36" height="36"/>
      </bpmndi:BPMNShape>

      <!-- task_receive: pos=1, lane=0 → center (420,140) → bounds (370,100,100,80) -->
      <bpmndi:BPMNShape id="task_receive_di" bpmnElement="task_receive">
        <dc:Bounds x="370" y="100" width="100" height="80"/>
      </bpmndi:BPMNShape>

      <!-- gw_approved: pos=2, lane=1 → center (580,260) → bounds (555,235,50,50) -->
      <bpmndi:BPMNShape id="gw_approved_di" bpmnElement="gw_approved" isMarkerVisible="true">
        <dc:Bounds x="555" y="235" width="50" height="50"/>
      </bpmndi:BPMNShape>

      <!-- task_approve: pos=3, lane=1 → center (740,260) → bounds (690,220,100,80) -->
      <bpmndi:BPMNShape id="task_approve_di" bpmnElement="task_approve">
        <dc:Bounds x="690" y="220" width="100" height="80"/>
      </bpmndi:BPMNShape>

      <!-- task_reject: pos=3 offset, lane=1 → center (740,320) → bounds (690,280,100,80)
           Note: for branches, offset branch elements below the main lane path -->
      <bpmndi:BPMNShape id="task_reject_di" bpmnElement="task_reject">
        <dc:Bounds x="690" y="280" width="100" height="80"/>
      </bpmndi:BPMNShape>

      <!-- end_1: pos=4, lane=1 → center (900,260) → bounds (882,242,36,36) -->
      <bpmndi:BPMNShape id="end_1_di" bpmnElement="end_1">
        <dc:Bounds x="882" y="242" width="36" height="36"/>
      </bpmndi:BPMNShape>

      <!-- flow_1: start_1 → task_receive (same lane) -->
      <bpmndi:BPMNEdge id="flow_1_di" bpmnElement="flow_1">
        <di:waypoint x="278" y="140"/>
        <di:waypoint x="370" y="140"/>
      </bpmndi:BPMNEdge>

      <!-- flow_2: task_receive → gw_approved (lane 0 → lane 1) -->
      <bpmndi:BPMNEdge id="flow_2_di" bpmnElement="flow_2">
        <di:waypoint x="470" y="140"/>
        <di:waypoint x="580" y="140"/>
        <di:waypoint x="580" y="235"/>
      </bpmndi:BPMNEdge>

      <!-- flow_3: gw_approved → task_approve (Yes) -->
      <bpmndi:BPMNEdge id="flow_3_di" bpmnElement="flow_3">
        <di:waypoint x="605" y="260"/>
        <di:waypoint x="690" y="260"/>
      </bpmndi:BPMNEdge>

      <!-- flow_4: gw_approved → task_reject (No) -->
      <bpmndi:BPMNEdge id="flow_4_di" bpmnElement="flow_4">
        <di:waypoint x="580" y="285"/>
        <di:waypoint x="580" y="320"/>
        <di:waypoint x="690" y="320"/>
      </bpmndi:BPMNEdge>

      <!-- flow_5: task_approve → end_1 -->
      <bpmndi:BPMNEdge id="flow_5_di" bpmnElement="flow_5">
        <di:waypoint x="790" y="260"/>
        <di:waypoint x="882" y="260"/>
      </bpmndi:BPMNEdge>

      <!-- flow_6: task_reject → end_1 -->
      <bpmndi:BPMNEdge id="flow_6_di" bpmnElement="flow_6">
        <di:waypoint x="790" y="320"/>
        <di:waypoint x="900" y="320"/>
        <di:waypoint x="900" y="278"/>
      </bpmndi:BPMNEdge>

    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>

</bpmn:definitions>
\`\`\`

Always produce complete, valid XML with the bpmndi section. Do not truncate or use placeholders.`;

const CLARIFY_SYSTEM_PROMPT = `You are a BPMN 2.0 expert. Analyze the given business process description and determine if it is missing critical information needed to generate valid BPMN 2.0 XML.

Check specifically for:
1. A clear start point (what triggers the process?)
2. At least one identifiable actor or system
3. A clear end point (when does the process complete?)

Rules:
- Only ask for clarification if the description is GENUINELY ambiguous — not just incomplete in minor ways
- If a reasonable assumption can be made, do NOT ask for clarification
- If clarification IS needed, ask only ONE focused question about the most critical missing piece
- If the description is reasonably clear, return needsClarification: false

Respond with a JSON object:
{
  "needsClarification": boolean,
  "question": string | null
}`;

router.post("/bpmn/clarify", async (req, res): Promise<void> => {
  const parsed = ClarifyBpmnBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { description } = parsed.data;

  const completion = await openai.chat.completions.create({
    model: "gpt-5.2",
    max_completion_tokens: 512,
    messages: [
      { role: "system", content: CLARIFY_SYSTEM_PROMPT },
      { role: "user", content: description },
    ],
    response_format: { type: "json_object" },
  });

  const content = completion.choices[0]?.message?.content ?? "{}";
  let result: { needsClarification: boolean; question: string | null };
  try {
    result = JSON.parse(content);
  } catch {
    result = { needsClarification: false, question: null };
  }

  res.json({
    needsClarification: result.needsClarification ?? false,
    question: result.question ?? null,
  });
});

router.post("/bpmn/convert", async (req, res): Promise<void> => {
  const parsed = ConvertToBpmnBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { description, clarificationAnswers } = parsed.data;

  let userMessage = description;
  if (clarificationAnswers && Object.keys(clarificationAnswers).length > 0) {
    const answersText = Object.entries(clarificationAnswers)
      .map(([q, a]) => `Q: ${q}\nA: ${a}`)
      .join("\n\n");
    userMessage = `${description}\n\nAdditional clarifications:\n${answersText}`;
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-5.2",
    max_completion_tokens: 8192,
    messages: [
      { role: "system", content: BPMN_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    response_format: { type: "json_object" },
  });

  const content = completion.choices[0]?.message?.content ?? "{}";
  let result: {
    xml?: string;
    elementMapping?: Array<{
      step: string;
      elementId: string;
      bpmnElement: string;
      type: string;
      actor: string;
    }>;
    issues?: Array<{ severity: string; message: string }>;
  };
  try {
    result = JSON.parse(content);
  } catch {
    res.status(500).json({ error: "Failed to parse AI response" });
    return;
  }

  if (!result.xml) {
    res.status(500).json({ error: "AI did not return valid BPMN XML" });
    return;
  }

  res.json({
    xml: result.xml,
    elementMapping: result.elementMapping ?? [],
    issues: result.issues ?? [],
  });
});

export default router;
