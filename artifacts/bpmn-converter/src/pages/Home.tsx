import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Workflow, Sparkles, MessageSquare, Code2, Table2, AlertTriangle, ArrowRight, Loader2 } from "lucide-react";
import { useBpmnWorkflow } from "@/hooks/use-bpmn-workflow";
import { XmlViewer } from "@/components/XmlViewer";
import { MappingTable } from "@/components/MappingTable";
import { IssuesList } from "@/components/IssuesList";

const DEFAULT_EXAMPLE = `A customer places an order on our webshop.
If the items are in stock, the warehouse picks and packs the order. If they are out of stock, the purchasing department orders more items from the supplier and we wait until they arrive before packing.
After packing, the shipping department dispatches the package and the customer receives an email notification.`;

type TabType = 'xml' | 'mapping' | 'issues';

export default function Home() {
  const { state, startWorkflow, submitAnswerAndConvert, description, setDescription } = useBpmnWorkflow();
  const [answerInput, setAnswerInput] = useState("");
  const [activeTab, setActiveTab] = useState<TabType>('xml');

  // Initialize with example on mount
  useState(() => {
    if (!description) setDescription(DEFAULT_EXAMPLE);
  });

  const handleConvertClick = () => {
    startWorkflow(description);
  };

  const handleAnswerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (answerInput.trim()) {
      submitAnswerAndConvert(answerInput);
      setAnswerInput("");
    }
  };

  const isProcessing = state.status === "clarifying" || state.status === "converting";

  return (
    <div className="min-h-screen bg-background text-foreground pb-20 selection:bg-primary/20">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20 text-primary-foreground">
              <Workflow className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-tight leading-tight">BPMN 2.0 Converter</h1>
              <p className="text-xs text-muted-foreground font-medium">AI-Powered Process Modeling</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 lg:pt-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          
          {/* Left Column: Input */}
          <div className="lg:col-span-5 space-y-6">
            <div className="space-y-4">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground">Describe your process</h2>
                <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
                  Write a plain-English description of a business process. Our agent will analyze actors, gateways, and events to generate standard BPMN 2.0 XML.
                </p>
              </div>

              <div className="relative group">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. A customer submits a loan application..."
                  className="w-full h-[320px] p-5 rounded-2xl bg-card border-2 border-border/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-300 resize-none shadow-sm group-hover:border-border"
                  disabled={isProcessing}
                />
                
                {/* Decorative gradient blur behind textarea */}
                <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/20 to-accent/20 rounded-[18px] blur opacity-0 group-hover:opacity-100 transition duration-500 -z-10" />
              </div>

              <button
                onClick={handleConvertClick}
                disabled={isProcessing || !description.trim()}
                className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-semibold text-primary-foreground bg-gradient-to-r from-primary to-primary/90 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5 active:translate-y-0 active:shadow-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                {state.status === "clarifying" ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Analyzing semantics...</>
                ) : state.status === "converting" ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Generating BPMN...</>
                ) : (
                  <><Sparkles className="w-5 h-5" /> Convert to BPMN</>
                )}
              </button>
            </div>

            {/* Clarification Dialog / Inline Card */}
            <AnimatePresence>
              {state.status === "needs_answer" && (
                <motion.div
                  initial={{ opacity: 0, height: 0, y: -20 }}
                  animate={{ opacity: 1, height: 'auto', y: 0 }}
                  exit={{ opacity: 0, height: 0, scale: 0.95 }}
                  className="overflow-hidden"
                >
                  <div className="p-6 mt-4 rounded-2xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 shrink-0">
                        <MessageSquare className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-blue-900 dark:text-blue-200">Clarification Needed</h3>
                        <p className="text-sm mt-2 text-blue-800/80 dark:text-blue-300/80 leading-relaxed font-medium">
                          {state.question}
                        </p>
                        
                        <form onSubmit={handleAnswerSubmit} className="mt-4 flex gap-2">
                          <input
                            type="text"
                            value={answerInput}
                            onChange={(e) => setAnswerInput(e.target.value)}
                            placeholder="Your answer..."
                            className="flex-1 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                            autoFocus
                          />
                          <button
                            type="submit"
                            disabled={!answerInput.trim()}
                            className="px-4 py-2.5 rounded-xl bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                          >
                            Continue <ArrowRight className="w-4 h-4" />
                          </button>
                        </form>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right Column: Output */}
          <div className="lg:col-span-7 relative">
            <AnimatePresence mode="wait">
              {state.status === "idle" || state.status === "clarifying" || state.status === "needs_answer" || state.status === "error" ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="h-full min-h-[500px] flex flex-col items-center justify-center p-8 border-2 border-dashed border-border/60 rounded-3xl bg-muted/20"
                >
                  <div className="w-20 h-20 mb-6 rounded-2xl bg-secondary/50 flex items-center justify-center text-muted-foreground/50">
                    <Workflow className="w-10 h-10" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground/70">Awaiting Process</h3>
                  <p className="text-center text-muted-foreground mt-2 max-w-sm text-sm">
                    Enter your process description and click convert to see the generated BPMN diagram, mapping, and insights.
                  </p>
                </motion.div>
              ) : state.status === "converting" ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="h-full min-h-[500px] flex flex-col items-center justify-center p-8 border border-border rounded-3xl bg-card shadow-sm"
                >
                  <div className="relative">
                    <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center animate-pulse">
                      <Workflow className="w-10 h-10 text-primary" />
                    </div>
                    <Loader2 className="w-6 h-6 text-primary absolute -bottom-2 -right-2 animate-spin bg-card rounded-full" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground mt-8 animate-pulse">Orchestrating logic...</h3>
                  <p className="text-center text-muted-foreground mt-2 max-w-sm text-sm">
                    Building gateways, connecting sequence flows, and defining actors.
                  </p>
                </motion.div>
              ) : state.status === "success" ? (
                <motion.div
                  key="results"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col h-full bg-card rounded-3xl border border-border shadow-xl overflow-hidden shadow-black/5"
                >
                  {/* Tabs Header */}
                  <div className="flex px-2 pt-2 bg-muted/30 border-b border-border overflow-x-auto hide-scrollbar">
                    <button
                      onClick={() => setActiveTab('xml')}
                      className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'xml' ? 'border-primary text-primary bg-background/50 rounded-t-xl' : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-t-xl'}`}
                    >
                      <Code2 className="w-4 h-4" /> BPMN XML
                    </button>
                    <button
                      onClick={() => setActiveTab('mapping')}
                      className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'mapping' ? 'border-primary text-primary bg-background/50 rounded-t-xl' : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-t-xl'}`}
                    >
                      <Table2 className="w-4 h-4" /> Element Mapping
                    </button>
                    <button
                      onClick={() => setActiveTab('issues')}
                      className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'issues' ? 'border-primary text-primary bg-background/50 rounded-t-xl' : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-t-xl'}`}
                    >
                      <AlertTriangle className="w-4 h-4" /> Issues & Assumptions
                      {state.data.issues.length > 0 && (
                        <span className="ml-1.5 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400 text-[10px] font-bold">
                          {state.data.issues.length}
                        </span>
                      )}
                    </button>
                  </div>

                  {/* Tab Content */}
                  <div className="p-6 flex-1 overflow-y-auto bg-background">
                    <AnimatePresence mode="wait">
                      {activeTab === 'xml' && (
                        <motion.div key="tab-xml" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                          <XmlViewer xml={state.data.xml} />
                        </motion.div>
                      )}
                      {activeTab === 'mapping' && (
                        <motion.div key="tab-mapping" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                          <MappingTable mapping={state.data.elementMapping} />
                        </motion.div>
                      )}
                      {activeTab === 'issues' && (
                        <motion.div key="tab-issues" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                          <IssuesList issues={state.data.issues} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

        </div>
      </main>
    </div>
  );
}
