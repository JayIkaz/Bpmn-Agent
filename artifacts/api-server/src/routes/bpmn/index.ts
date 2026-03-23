import { Router, type IRouter } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  ConvertToBpmnBody,
  ClarifyBpmnBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

const BPMN_SYSTEM_PROMPT = `You are a BPMN 2.0 expert agent. Your job is to convert plain-language business process descriptions into valid, well-structured BPMN 2.0 XML.

## Behaviour Rules

### Ambiguity Handling
Before generating, check whether the input has:
- A clear start point
- At least one identifiable actor or system
- A clear end point

If ANY of these is missing or genuinely ambiguous, make a reasonable assumption and document it. Do not ask clarification questions — always produce output.

### Generation Approach
Always produce the XML first. Then include a structured Issues & Assumptions block.

## Output Format

You MUST respond with a valid JSON object in exactly this structure:
{
  "xml": "<the complete BPMN 2.0 XML string>",
  "elementMapping": [
    { "step": "Customer submits order", "elementId": "task_submitOrder", "bpmnElement": "submitOrder", "type": "userTask", "actor": "Customer" }
  ],
  "issues": [
    { "severity": "assumption", "message": "Single actor assumed; no swimlanes used." },
    { "severity": "issue", "message": "Timer duration not specified — interrupting boundary timer used as default." }
  ]
}

## BPMN 2.0 XML Rules

### Namespace
The XML must use: xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" and xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"

### Element IDs
Every element MUST have a unique id attribute (e.g. id="task_1", id="gw_approve", id="lane_finance")

### Actors & Swimlanes
- If multiple distinct actors, roles, or systems are mentioned (or clearly implied), use a bpmn:collaboration with bpmn:participant pools and bpmn:laneSet / bpmn:lane elements
- If only one actor (or none), use a single pool with no lanes
- If an actor is implied but not named, assign a descriptive label (e.g. "System", "Unknown Role") and flag as an assumption

### Gateways
- Exclusive (XOR): <bpmn:exclusiveGateway> — when one path is taken (keywords: if, when, otherwise, in case of)
- Parallel (AND): <bpmn:parallelGateway> — when all paths are taken (keywords: in parallel, simultaneously, at the same time)
- Inclusive (OR): <bpmn:inclusiveGateway> — when one or more paths (keywords: optionally, may also, if applicable)
- When keyword evidence is absent, default to Exclusive and flag as an assumption
- Every gateway that splits flow MUST have a corresponding joining gateway of the same type

### Timer & Boundary Events
- Use <bpmn:timerEventDefinition> only when the input explicitly mentions: deadline, duration, schedule, timeout, escalation
- Attach boundary events to the task they interrupt — never float them unattached
- NEVER add timer events speculatively

### Must-Have Elements
- Start Event: <bpmn:startEvent> — always required
- End Event: <bpmn:endEvent> — always required, every path must terminate
- Tasks: appropriate task type per action step
- Sequence Flows: <bpmn:sequenceFlow> for every connection
- Message Flows: <bpmn:messageFlow> when actors exchange info across pools

### Anti-Hallucination Rules
Before outputting XML, verify:
- Every sequenceFlow references sourceRef and targetRef that both exist
- Every gateway has at least two outgoing sequence flows
- Every split gateway has a matching join gateway of the same type
- No element id is duplicated
- Every actor mentioned has a corresponding lane or pool
- No BPMN element exists that has no basis in the input

### Example Structure for Multi-Lane Process
\`\`\`xml
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" id="definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="collab_1">
    <bpmn:participant id="participant_1" name="Order Fulfilment" processRef="process_1"/>
  </bpmn:collaboration>
  <bpmn:process id="process_1" isExecutable="false">
    <bpmn:laneSet id="laneSet_1">
      <bpmn:lane id="lane_sales" name="Sales">
        <bpmn:flowNodeRef>start_1</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>task_receiveOrder</bpmn:flowNodeRef>
      </bpmn:lane>
      <bpmn:lane id="lane_finance" name="Finance">
        <bpmn:flowNodeRef>task_approveOrder</bpmn:flowNodeRef>
      </bpmn:lane>
    </bpmn:laneSet>
    <bpmn:startEvent id="start_1" name="Start"/>
    <bpmn:userTask id="task_receiveOrder" name="Receive Order"/>
    <bpmn:userTask id="task_approveOrder" name="Approve Order"/>
    <bpmn:endEvent id="end_1" name="End"/>
    <bpmn:sequenceFlow id="flow_1" sourceRef="start_1" targetRef="task_receiveOrder"/>
    <bpmn:sequenceFlow id="flow_2" sourceRef="task_receiveOrder" targetRef="task_approveOrder"/>
    <bpmn:sequenceFlow id="flow_3" sourceRef="task_approveOrder" targetRef="end_1"/>
  </bpmn:process>
</bpmn:definitions>
\`\`\`

Always produce complete, valid XML. Do not truncate or use placeholders.`;

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
