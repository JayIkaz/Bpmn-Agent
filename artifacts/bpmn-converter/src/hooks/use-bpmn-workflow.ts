import { useState } from "react";
import { useClarifyBpmn, useConvertToBpmn } from "@workspace/api-client-react";
import type { ConvertBpmnResponse } from "@workspace/api-client-react";
import { useToast } from "@/components/ui/use-toast";

type WorkflowState = 
  | { status: "idle" }
  | { status: "clarifying" }
  | { status: "needs_answer"; question: string }
  | { status: "converting" }
  | { status: "success"; data: ConvertBpmnResponse }
  | { status: "error"; error: string };

export function useBpmnWorkflow() {
  const [state, setState] = useState<WorkflowState>({ status: "idle" });
  const [description, setDescription] = useState("");
  const { toast } = useToast();

  const clarifyMutation = useClarifyBpmn();
  const convertMutation = useConvertToBpmn();

  const startWorkflow = async (desc: string) => {
    if (!desc.trim()) return;
    
    setDescription(desc);
    setState({ status: "clarifying" });

    try {
      const clarifyRes = await clarifyMutation.mutateAsync({
        data: { description: desc }
      });

      if (clarifyRes.needsClarification && clarifyRes.question) {
        setState({ status: "needs_answer", question: clarifyRes.question });
      } else {
        // Proceed directly to conversion
        await executeConversion(desc);
      }
    } catch (err: any) {
      const errMsg = err?.data?.error || err.message || "Failed to clarify description";
      setState({ status: "error", error: errMsg });
      toast({ title: "Error", description: errMsg, variant: "destructive" });
    }
  };

  const submitAnswerAndConvert = async (answer: string) => {
    if (state.status !== "needs_answer") return;
    await executeConversion(description, { [state.question]: answer });
  };

  const executeConversion = async (desc: string, answers?: Record<string, string>) => {
    setState({ status: "converting" });
    try {
      const convertRes = await convertMutation.mutateAsync({
        data: {
          description: desc,
          ...(answers && { clarificationAnswers: answers })
        }
      });
      setState({ status: "success", data: convertRes });
    } catch (err: any) {
      const errMsg = err?.data?.error || err.message || "Failed to convert to BPMN";
      setState({ status: "error", error: errMsg });
      toast({ title: "Conversion Failed", description: errMsg, variant: "destructive" });
    }
  };

  const reset = () => {
    setState({ status: "idle" });
  };

  return {
    state,
    startWorkflow,
    submitAnswerAndConvert,
    reset,
    description,
    setDescription
  };
}
