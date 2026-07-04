import { Router, type IRouter } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  ConvertToBpmnBody,
  ClarifyBpmnBody,
} from "@workspace/api-zod";
import { validateBpmnXml } from "./validate-bpmn-xml.js";

const router: IRouter = Router();

const BPMN_SYSTEM_PROMPT = `You are a BPMN 2.0 XML generator. Your input is a plain-English description of a business process. Your output is valid, renderable BPMN 2.0 XML plus structured metadata.

---

## PARSING RULES

**Actors → swim lanes**
Every distinct role, department, or system mentioned becomes a separate lane inside a single pool. If an actor is implied (e.g. "an email is sent") but no sender is named, assign the task to the most recently active actor. Never create a lane for an actor who is only a recipient of information.

**Verbs → tasks**
Map every action verb to a task. Use the most specific BPMN task type available:
- Human action (fill in, approve, review, sign) → userTask
- System/automated action (send email, check stock, calculate) → serviceTask
- Physical action (pick, pack, ship, sign document) → manualTask
- Waiting for an external trigger or message → receiveTask

**Conditionals → gateways**
- "if / either / or / depending on" → exclusiveGateway (XOR)
- "simultaneously / in parallel / at the same time" → parallelGateway
- All gateways require a matching closing gateway unless the branches terminate independently with their own end events.
- Label every sequence flow out of an exclusive gateway with its condition (e.g. "Yes", "No", or the specific condition text).

**Events**
- Start the process with a startEvent. Label it with what triggers the process (e.g. "Order placed").
- End every branch that terminates the process with an endEvent. Use a plain endEvent by default. Only use a terminateEndEvent if the input explicitly states all other branches should stop.
- Use an intermediateCatchEvent (type: timer) for explicit waiting steps where the trigger is time-based. Use a receiveTask where the wait is for an external message or delivery.

---

## NAMING CONVENTION

Apply this convention to every element ID without exception:

| Element type | Prefix | Format | Example |
|---|---|---|---|
| Start event | start_ | camelCase | start_orderPlaced |
| End event | end_ | camelCase | end_orderComplete |
| User task | ut_ | camelCase | ut_placeOrder |
| Service task | st_ | camelCase | st_checkStock |
| Manual task | mt_ | camelCase | mt_pickAndPackOrder |
| Receive task | rt_ | camelCase | rt_itemsReceived |
| Exclusive gateway | xgw_ | camelCase | xgw_itemsInStock |
| Parallel gateway | pgw_ | camelCase | pgw_splitFulfillment |
| Intermediate event | ie_ | camelCase | ie_waitForDelivery |
| Sequence flow | sf_ | camelCase | sf_orderToCheck |
| Lane | lane_ | camelCase | lane_warehouse |
| Pool | pool_ | camelCase | pool_orderFulfillment |

Never mix prefix styles. Never use underscores within the camelCase portion.

---

## LAYOUT CALCULATION

Use these rules to compute all x/y/width/height values. Every element must have explicit bounds — never omit them.

**Grid unit**: 220px horizontal (generous spacing so labels have room), 160px vertical per lane.
**Task size**: width=140, height=80. (140px wide gives enough room for labels up to ~20 characters without wrapping)
**Gateway size**: width=50, height=50.
**Event size**: width=36, height=36.

**Pool & lane setup**
- Pool starts at: x=150, y=80
- Lane label column width: 30px (content area starts at x=180)
- Lane height: 160px per lane — generous vertical space so labels never overlap

**Horizontal positioning**
Assign each element a flow-position P starting at P=0 (start event). Each subsequent step increments P by 1. Gateway opening and closing nodes each count as one position.
- First element center_x = 310 (i.e. 310 + 0 × 220)
- General formula: center_x = 310 + P × 220
- Pool width = (max_P + 2) × 220 + 80. Never hard-code a pool width.

**Vertical positioning**
Assign each lane an index L starting at L=0 (top).
- Element center_y = 80 + L × 160 + 80
- bounds.x = center_x − (width / 2)
- bounds.y = center_y − (height / 2)
- lane L: x=180, y=(80 + L×160), width=(pool_width − 30), height=160

**Edges**
- Same lane: waypoint right-center of source → left-center of target
- Cross-lane: add intermediate waypoint at mid-x between the two elements, at target lane center_y
- For join gateways: multiple incoming edges converge correctly with waypoints

---

## XML REQUIREMENTS

- Use namespace prefix bpmn: for all process elements; bpmndi: for diagram elements; dc: for bounds; di: for waypoints.
- The <bpmn:definitions> root MUST include ALL of these namespace declarations:
    xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
    xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
    xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
    xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    targetNamespace="http://bpmn.io/schema/bpmn"
- Every element in the process must have a corresponding BPMNShape or BPMNEdge in the BPMNDiagram section.
- Every sequenceFlow must have waypoints in its BPMNEdge.
- All ID attributes must be unique across the entire document.
- Validate that every gateway has the correct number of incoming and outgoing sequence flows before outputting.
- Add isMarkerVisible="true" on every exclusiveGateway shape in the BPMNDiagram section.
- Add conditionExpression on every outgoing sequence flow from an exclusiveGateway.

---

## ASSUMPTIONS AND ISSUES

Apply sensible BPMN defaults silently — do not flag them as assumptions. Defaults include:
- Using a plain endEvent when the input does not specify termination semantics.
- Assigning ambiguous automated steps to serviceTask.
- Treating "wait until X arrives" as a receiveTask.

Only report an item in the Issues & Assumptions output if:
1. The input is genuinely ambiguous in a way that materially changes the process structure (e.g. it is unclear whether two activities run in parallel or in sequence), OR
2. The generated XML contains a known constraint violation that cannot be auto-corrected.

For each reported item, state: (a) what was ambiguous or wrong, (b) what choice was made and why, (c) what the user should change if that choice is incorrect.

Do not report layout preferences, default event type choices, or naming decisions as assumptions.

---

## OUTPUT FORMAT

Return a JSON object with exactly these four keys:

{
  "bpmnXml": "<string> Complete, valid BPMN 2.0 XML including BPMNDiagram section",
  "elementMapping": [
    {
      "originalStep": "<string> phrase from the user input",
      "bpmnId": "<string> element ID",
      "bpmnName": "<string> element display name",
      "type": "<string> BPMN element type"
    }
  ],
  "issuesAndAssumptions": [
    {
      "severity": "issue | assumption",
      "description": "<string>",
      "choiceMade": "<string>",
      "alternativeIfWrong": "<string>"
    }
  ],
  "processTitle": "<string> Short title inferred from the input, max 6 words"
}

Return only this JSON object. No preamble, no markdown fences, no commentary outside the object.`;

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

interface BpmnConversionResult {
  bpmnXml?: string;
  elementMapping?: Array<{
    originalStep: string;
    bpmnId: string;
    bpmnName: string;
    type: string;
  }>;
  issuesAndAssumptions?: Array<{
    severity: string;
    description: string;
    choiceMade: string;
    alternativeIfWrong: string;
  }>;
  processTitle?: string;
}

async function requestBpmnConversion(
  messages: Array<{ role: "system" | "user"; content: string }>,
): Promise<
  | { ok: true; result: BpmnConversionResult }
  | { ok: false; error: string }
> {
  const completion = await openai.chat.completions.create({
    model: "gpt-5.2",
    max_completion_tokens: 8192,
    messages,
    response_format: { type: "json_object" },
  });

  const content = completion.choices[0]?.message?.content ?? "{}";
  let result: BpmnConversionResult;
  try {
    result = JSON.parse(content);
  } catch {
    return { ok: false, error: "Failed to parse AI response as JSON" };
  }

  if (!result.bpmnXml) {
    return { ok: false, error: "AI did not return any BPMN XML" };
  }

  return { ok: true, result };
}

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

  const messages: Array<{ role: "system" | "user"; content: string }> = [
    { role: "system", content: BPMN_SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];

  const firstAttempt = await requestBpmnConversion(messages);

  let finalResult: BpmnConversionResult | null = null;
  let lastError: string | null = null;

  if (!firstAttempt.ok) {
    lastError = firstAttempt.error;
  } else {
    const validation = validateBpmnXml(firstAttempt.result.bpmnXml!);
    if (validation.valid) {
      finalResult = firstAttempt.result;
    } else {
      lastError = `Generated BPMN XML failed validation: ${validation.errors.join("; ")}`;
    }
  }

  if (!finalResult) {
    // Retry once with an error hint appended to the prompt.
    const retryMessages: Array<{ role: "system" | "user"; content: string }> = [
      ...messages,
      {
        role: "user",
        content: `Your previous response was invalid. Fix the following problem(s) and return a complete, corrected JSON object with the same four keys:\n${lastError}`,
      },
    ];

    const retryAttempt = await requestBpmnConversion(retryMessages);

    if (!retryAttempt.ok) {
      lastError = retryAttempt.error;
    } else {
      const validation = validateBpmnXml(retryAttempt.result.bpmnXml!);
      if (validation.valid) {
        finalResult = retryAttempt.result;
      } else {
        lastError = `Generated BPMN XML failed validation: ${validation.errors.join("; ")}`;
      }
    }
  }

  if (!finalResult) {
    res.status(500).json({
      error: `We couldn't generate a valid BPMN diagram for this description. ${lastError ?? "Please try rephrasing your process description."}`,
    });
    return;
  }

  res.json({
    bpmnXml: finalResult.bpmnXml,
    elementMapping: finalResult.elementMapping ?? [],
    issuesAndAssumptions: finalResult.issuesAndAssumptions ?? [],
    processTitle: finalResult.processTitle ?? "",
  });
});

export default router;
