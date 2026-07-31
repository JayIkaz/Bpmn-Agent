import { Router, type IRouter } from "express";
import { layoutProcess, LayoutError, type LayoutWarning } from "bpmn-auto-layout";
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

## XML REQUIREMENTS

Emit the SEMANTIC model only. Do not compute or include any visual information: shape positions, edge waypoints, and pool/lane bounds are generated afterwards by a dedicated layout engine, not by you.

- Do NOT emit a <bpmndi:BPMNDiagram> section, and do NOT emit x/y/width/height/waypoint/isMarkerVisible/isHorizontal values anywhere.
- Use the namespace prefix bpmn: for every element.
- The <bpmn:definitions> root MUST include:
    xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    targetNamespace="http://bpmn.io/schema/bpmn"

**Pool and lane structure** — the layout engine only draws a pool if you model one explicitly:
- Emit a <bpmn:collaboration> containing a single <bpmn:participant> whose processRef is the id of the <bpmn:process>. That participant IS the pool: give it the pool_ id and a name.
- Emit one <bpmn:laneSet> as the first child of the <bpmn:process>, with one <bpmn:lane> per actor, declared in top-to-bottom reading order.
- Every flow node must be listed in exactly one lane's <bpmn:flowNodeRef>. A node listed in no lane is not placed in a swimlane; a node listed in two lanes is rejected outright.
- Only flow nodes go in flowNodeRef — never sequence flows.

**Referential integrity** — check all of this yourself before outputting:
- All ID attributes are unique across the entire document.
- Every sequenceFlow's sourceRef and targetRef names a flow node declared in the same process.
- Every gateway has at least one incoming and at least one outgoing sequence flow. A splitting gateway has one incoming and several outgoing; a merging gateway has several incoming and one outgoing.
- Every boundaryEvent's attachedToRef names an activity in the same process.
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
  "bpmnXml": "<string> Complete, valid semantic BPMN 2.0 XML — no BPMNDiagram section, no coordinates",
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

  // The model produced semantic-only XML. Positions, bounds and waypoints are
  // computed here instead of being hand-rolled by the model — this replaces the
  // old grid-math prompt section and its matching geometric containment check.
  let laidOutXml: string;
  let layoutWarnings: LayoutWarning[] = [];
  try {
    const layoutResult = await layoutProcess(finalResult.bpmnXml!);
    laidOutXml = layoutResult.xml;
    layoutWarnings = layoutResult.warnings ?? [];
  } catch (err) {
    // A LayoutError means the semantic model is structurally unlayoutable
    // (e.g. a flow node claimed by two lanes, an unroutable connection).
    const detail =
      err instanceof LayoutError
        ? `${err.message}${err.elementId ? ` (element "${err.elementId}")` : ""}`
        : err instanceof Error
          ? err.message
          : String(err);
    res.status(500).json({
      error: `We understood the process but couldn't lay out a diagram for it: ${detail}`,
    });
    return;
  }

  const issuesAndAssumptions = [...(finalResult.issuesAndAssumptions ?? [])];
  for (const warning of layoutWarnings) {
    issuesAndAssumptions.push({
      severity: "assumption",
      description: `Layout warning: ${warning.message}`,
      choiceMade: warning.elementId
        ? `Element "${warning.elementId}" may not have been drawn.`
        : "See the message for the affected element(s).",
      alternativeIfWrong: "Adjust the element manually in a BPMN editor.",
    });
  }

  res.json({
    bpmnXml: laidOutXml,
    elementMapping: finalResult.elementMapping ?? [],
    issuesAndAssumptions,
    processTitle: finalResult.processTitle ?? "",
  });
});

export default router;
