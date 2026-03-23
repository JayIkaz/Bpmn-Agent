import { Router, type IRouter } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  ConvertToBpmnBody,
  ClarifyBpmnBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

const BPMN_SYSTEM_PROMPT = `You are a BPMN 2.0 expert agent. Convert plain-language business process descriptions into professional, Visio-quality BPMN 2.0 XML — including a complete bpmndi layout section and full semantic annotations.

## Output Format

Respond with a JSON object in this exact structure:
{
  "xml": "<complete BPMN 2.0 XML string with bpmndi layout>",
  "elementMapping": [
    { "step": "Customer submits order", "elementId": "task_submitOrder", "bpmnElement": "submitOrder", "type": "userTask", "actor": "Customer" }
  ],
  "issues": [
    { "severity": "assumption", "message": "..." },
    { "severity": "issue", "message": "..." }
  ]
}

## BPMN 2.0 XML Rules

### Required Namespaces
The <bpmn:definitions> root MUST include ALL of these namespace declarations:
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  targetNamespace="http://bpmn.io/schema/bpmn"

### Task Type Selection (critical for icons)
Choose the most specific task type based on what the step does:
- <bpmn:userTask>      — performed by a human (review, approve, fill form, negotiate)
- <bpmn:serviceTask>   — automated system action (send API call, run calculation, update DB, process payment)
- <bpmn:sendTask>      — sends a message, email, or notification to an external party
- <bpmn:receiveTask>   — waits for an incoming message, response, or external signal
- <bpmn:scriptTask>    — runs a script or automated rule (data transformation, format conversion)
- <bpmn:businessRuleTask> — applies a business rule or decision table
- <bpmn:manualTask>    — physical activity performed without system support (package goods, install hardware)
Default to <bpmn:userTask> only when none of the above clearly applies.

### Event Type Selection (critical for icons)
**Start Events:**
- Plain <bpmn:startEvent> — default trigger
- With <bpmn:messageEventDefinition/> — triggered by receiving a message/request
- With <bpmn:timerEventDefinition> — triggered on a schedule

**End Events:**
- With <bpmn:terminateEventDefinition/> — always use this on end events that terminate the whole process
- With <bpmn:messageEventDefinition/> — process ends by sending a message/notification
- With <bpmn:errorEventDefinition/> — process ends due to an error/exception

**Intermediate Events (attach as boundary event or standalone):**
- Timer boundary: <bpmn:boundaryEvent attachedToRef="task_id" cancelActivity="true"> with <bpmn:timerEventDefinition>
- Message boundary: waiting for confirmation/response mid-process

### Gateway Annotations (critical for markers)
- <bpmn:exclusiveGateway> — add isMarkerVisible="true" (shows X diamond marker)
- <bpmn:parallelGateway> — shows + marker automatically
- <bpmn:inclusiveGateway> — shows O marker automatically
- Every gateway that splits flow MUST have a matching join gateway of the same type
- Add the default="flow_id" attribute on gateways when there is a default/fallback path
- Add name attribute to gateways with a decision question (e.g. name="In stock?")

### Condition Expressions (critical for labeled arrows)
On EVERY outgoing conditional sequence flow from a gateway, add:
1. A descriptive name attribute (e.g. name="Yes", name="No", name="Approved", name="Rejected")
2. A conditionExpression element:
\`\`\`xml
<bpmn:sequenceFlow id="flow_yes" name="Yes" sourceRef="gw_1" targetRef="task_next">
  <bpmn:conditionExpression xsi:type="tFormalExpression">\${condition}</bpmn:conditionExpression>
</bpmn:sequenceFlow>
\`\`\`

### Text Annotations (add for important context)
Use text annotations for important notes, SLA timers, or compliance rules:
\`\`\`xml
<bpmn:textAnnotation id="note_1">
  <bpmn:text>SLA: Must complete within 48 hours</bpmn:text>
</bpmn:textAnnotation>
<bpmn:association id="assoc_1" sourceRef="task_review" targetRef="note_1"/>
\`\`\`

### Actors & Swimlanes
- Use bpmn:collaboration + bpmn:participant + bpmn:laneSet when there are multiple actors
- Single actor or no actors: single pool, no lanes needed
- Name all lanes with the role/department name

## Layout System — bpmndi Section (REQUIRED)

Every XML output MUST include a complete <bpmndi:BPMNDiagram> section.

### Coordinate Grid
- Pool starts at: x=150, y=80
- Lane label column width: 30px (content area starts at x=180)
- Lane height: 160px per lane — generous vertical space so labels never overlap
- Horizontal spacing between element centers: 220px — generous horizontal spacing so labels have room
- First element center: x=310
- Element y-center in lane: lane_top_y + 80 (vertically centered)

### Element Sizes — IMPORTANT: use these exact dimensions
- startEvent / endEvent: 36 × 36
- userTask / serviceTask / sendTask / receiveTask / scriptTask / businessRuleTask / manualTask: 140 × 80
  (140px wide gives enough room for labels up to ~20 characters without wrapping)
- exclusiveGateway / parallelGateway / inclusiveGateway: 50 × 50
- textAnnotation: 150 × 60 (position above/beside the annotated element)

### Bounds Formula
For element at flow-position P (0-based) in lane index L (0-based):
  center_x = 310 + P × 220
  center_y = 80 + L × 160 + 80
  bounds.x = center_x − (width / 2)
  bounds.y = center_y − (height / 2)

### Pool & Lane Bounds
  pool_height = num_lanes × 160
  pool_width = (max_elements_in_flow + 1) × 220 + 80
  pool: x=150, y=80, width=pool_width, height=pool_height
  lane L: x=180, y=(80 + L×160), width=(pool_width − 30), height=160

### Edges
- Same lane: waypoint right-center of source → left-center of target
- Cross-lane: add intermediate waypoint at mid-x between the two elements, at target lane center_y
- For join gateways: multiple incoming edges converge correctly with waypoints

### Text Annotations
- Position textAnnotation shapes above or beside the annotated task, offset by ~20px vertically
- Association edge: straight line from annotation to the task with no arrowhead

## Complete Annotated Example (3 actors, gateway with conditions, typed tasks)

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
    <bpmn:participant id="part_1" name="Order Fulfilment" processRef="proc_1"/>
  </bpmn:collaboration>

  <bpmn:process id="proc_1" isExecutable="false">
    <bpmn:laneSet id="ls_1">
      <bpmn:lane id="lane_customer" name="Customer">
        <bpmn:flowNodeRef>start_orderPlaced</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>task_placeOrder</bpmn:flowNodeRef>
      </bpmn:lane>
      <bpmn:lane id="lane_finance" name="Finance">
        <bpmn:flowNodeRef>task_validatePayment</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>gw_paymentOk</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>task_notifyFailure</bpmn:flowNodeRef>
      </bpmn:lane>
      <bpmn:lane id="lane_warehouse" name="Warehouse">
        <bpmn:flowNodeRef>task_pickPack</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>task_dispatch</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>end_shipped</bpmn:flowNodeRef>
      </bpmn:lane>
    </bpmn:laneSet>

    <!-- Start: customer submits order via web -->
    <bpmn:startEvent id="start_orderPlaced" name="Order placed">
      <bpmn:messageEventDefinition/>
    </bpmn:startEvent>

    <!-- Customer places the order manually -->
    <bpmn:userTask id="task_placeOrder" name="Place order"/>

    <!-- Finance validates payment automatically -->
    <bpmn:serviceTask id="task_validatePayment" name="Validate payment"/>

    <!-- Decision: payment ok? -->
    <bpmn:exclusiveGateway id="gw_paymentOk" name="Payment OK?" isMarkerVisible="true" default="flow_no"/>

    <!-- Failure path: notify customer -->
    <bpmn:sendTask id="task_notifyFailure" name="Notify payment failure"/>

    <!-- Warehouse picks and packs -->
    <bpmn:manualTask id="task_pickPack" name="Pick &amp; pack order"/>

    <!-- Warehouse dispatches via carrier API -->
    <bpmn:serviceTask id="task_dispatch" name="Dispatch via carrier"/>

    <!-- End: order shipped -->
    <bpmn:endEvent id="end_shipped" name="Order shipped">
      <bpmn:terminateEventDefinition/>
    </bpmn:endEvent>

    <!-- Sequence flows -->
    <bpmn:sequenceFlow id="flow_1" sourceRef="start_orderPlaced" targetRef="task_placeOrder"/>
    <bpmn:sequenceFlow id="flow_2" sourceRef="task_placeOrder" targetRef="task_validatePayment"/>
    <bpmn:sequenceFlow id="flow_3" sourceRef="task_validatePayment" targetRef="gw_paymentOk"/>

    <bpmn:sequenceFlow id="flow_yes" name="Yes" sourceRef="gw_paymentOk" targetRef="task_pickPack">
      <bpmn:conditionExpression xsi:type="tFormalExpression">\${paymentAuthorised}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>

    <bpmn:sequenceFlow id="flow_no" name="No" sourceRef="gw_paymentOk" targetRef="task_notifyFailure">
      <bpmn:conditionExpression xsi:type="tFormalExpression">\${!paymentAuthorised}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>

    <bpmn:sequenceFlow id="flow_4" sourceRef="task_pickPack" targetRef="task_dispatch"/>
    <bpmn:sequenceFlow id="flow_5" sourceRef="task_dispatch" targetRef="end_shipped"/>
  </bpmn:process>

  <bpmndi:BPMNDiagram id="diagram_1">
    <bpmndi:BPMNPlane id="plane_1" bpmnElement="collab_1">

      <!-- Pool: 3 lanes × 140 = 420; 5 columns × 180 + 80 = 980 -->
      <bpmndi:BPMNShape id="part_1_di" bpmnElement="part_1" isHorizontal="true">
        <dc:Bounds x="150" y="80" width="980" height="420"/>
      </bpmndi:BPMNShape>

      <!-- Lane 0 (Customer): y=80, h=140 -->
      <bpmndi:BPMNShape id="lane_customer_di" bpmnElement="lane_customer" isHorizontal="true">
        <dc:Bounds x="180" y="80" width="950" height="140"/>
      </bpmndi:BPMNShape>
      <!-- Lane 1 (Finance): y=220, h=140 -->
      <bpmndi:BPMNShape id="lane_finance_di" bpmnElement="lane_finance" isHorizontal="true">
        <dc:Bounds x="180" y="220" width="950" height="140"/>
      </bpmndi:BPMNShape>
      <!-- Lane 2 (Warehouse): y=360, h=140 -->
      <bpmndi:BPMNShape id="lane_warehouse_di" bpmnElement="lane_warehouse" isHorizontal="true">
        <dc:Bounds x="180" y="360" width="950" height="140"/>
      </bpmndi:BPMNShape>

      <!-- start_orderPlaced: P=0, L=0 → center(280,150) → 36×36 → (262,132) -->
      <bpmndi:BPMNShape id="start_orderPlaced_di" bpmnElement="start_orderPlaced">
        <dc:Bounds x="262" y="132" width="36" height="36"/>
      </bpmndi:BPMNShape>

      <!-- task_placeOrder: P=1, L=0 → center(460,150) → 110×80 → (405,110) -->
      <bpmndi:BPMNShape id="task_placeOrder_di" bpmnElement="task_placeOrder">
        <dc:Bounds x="405" y="110" width="110" height="80"/>
      </bpmndi:BPMNShape>

      <!-- task_validatePayment: P=2, L=1 → center(640,290) → 110×80 → (585,250) -->
      <bpmndi:BPMNShape id="task_validatePayment_di" bpmnElement="task_validatePayment">
        <dc:Bounds x="585" y="250" width="110" height="80"/>
      </bpmndi:BPMNShape>

      <!-- gw_paymentOk: P=3, L=1 → center(820,290) → 50×50 → (795,265) -->
      <bpmndi:BPMNShape id="gw_paymentOk_di" bpmnElement="gw_paymentOk" isMarkerVisible="true">
        <dc:Bounds x="795" y="265" width="50" height="50"/>
      </bpmndi:BPMNShape>

      <!-- task_notifyFailure: P=3 branch, L=1 offset → center(820,360) → 110×80 → (765,320) -->
      <bpmndi:BPMNShape id="task_notifyFailure_di" bpmnElement="task_notifyFailure">
        <dc:Bounds x="765" y="340" width="110" height="80"/>
      </bpmndi:BPMNShape>

      <!-- task_pickPack: P=4, L=2 → center(1000,430) → 110×80 → (945,390) -->
      <bpmndi:BPMNShape id="task_pickPack_di" bpmnElement="task_pickPack">
        <dc:Bounds x="945" y="390" width="110" height="80"/>
      </bpmndi:BPMNShape>

      <!-- task_dispatch: P=5, L=2 → center(1000,430) offset → (1075,390) -->
      <bpmndi:BPMNShape id="task_dispatch_di" bpmnElement="task_dispatch">
        <dc:Bounds x="1075" y="390" width="110" height="80"/>
      </bpmndi:BPMNShape>

      <!-- end_shipped: P=6, L=2 → center(1280,430) → 36×36 → (1262,412) -->
      <bpmndi:BPMNShape id="end_shipped_di" bpmnElement="end_shipped">
        <dc:Bounds x="1262" y="412" width="36" height="36"/>
      </bpmndi:BPMNShape>

      <bpmndi:BPMNEdge id="flow_1_di" bpmnElement="flow_1">
        <di:waypoint x="298" y="150"/>
        <di:waypoint x="405" y="150"/>
      </bpmndi:BPMNEdge>

      <bpmndi:BPMNEdge id="flow_2_di" bpmnElement="flow_2">
        <di:waypoint x="515" y="150"/>
        <di:waypoint x="640" y="150"/>
        <di:waypoint x="640" y="250"/>
      </bpmndi:BPMNEdge>

      <bpmndi:BPMNEdge id="flow_3_di" bpmnElement="flow_3">
        <di:waypoint x="695" y="290"/>
        <di:waypoint x="795" y="290"/>
      </bpmndi:BPMNEdge>

      <bpmndi:BPMNEdge id="flow_yes_di" bpmnElement="flow_yes">
        <di:waypoint x="820" y="315"/>
        <di:waypoint x="820" y="430"/>
        <di:waypoint x="945" y="430"/>
      </bpmndi:BPMNEdge>

      <bpmndi:BPMNEdge id="flow_no_di" bpmnElement="flow_no">
        <di:waypoint x="820" y="290"/>
        <di:waypoint x="820" y="340"/>
        <di:waypoint x="765" y="380"/>
      </bpmndi:BPMNEdge>

      <bpmndi:BPMNEdge id="flow_4_di" bpmnElement="flow_4">
        <di:waypoint x="1055" y="430"/>
        <di:waypoint x="1075" y="430"/>
      </bpmndi:BPMNEdge>

      <bpmndi:BPMNEdge id="flow_5_di" bpmnElement="flow_5">
        <di:waypoint x="1185" y="430"/>
        <di:waypoint x="1262" y="430"/>
      </bpmndi:BPMNEdge>

    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>

</bpmn:definitions>
\`\`\`

Always output complete, valid XML. Do not truncate. Include bpmndi for every single element.`;

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
