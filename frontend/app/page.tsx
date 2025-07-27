"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CheckCircle,
  Clock,
  XCircle,
  Play,
  Save,
  Share,
  Plus,
  User,
  Settings,
  FileText,
  History,
  Globe,
  ChevronDown,
  ChevronRight,
  Code,
  Activity,
  Timer,
  Wand2,
} from "lucide-react";

interface WorkflowStep {
  stepTitle: string;
  requestDetails: any;
  responseDetails: any;
  extractedData?: any;
  status: "pending" | "executing" | "completed" | "error";
}

interface Plan {
  steps: Array<{
    description: string;
    action_type: string;
  }>;
}

export default function ApiFlowTester() {
  const [prompt, setPrompt] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [executionComplete, setExecutionComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const eventSourceRef = useRef<EventSource | null>(null);

  const mockWorkflows = [
    { name: "Login & Fetch Users", starred: true },
    { name: "E-commerce Checkout", starred: false },
    { name: "File Upload Workflow", starred: false },
  ];

  const toggleStepExpansion = (index: number) => {
    const newExpanded = new Set(expandedSteps);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedSteps(newExpanded);
  };

  const executeWorkflow = async () => {
    if (!prompt.trim()) return;

    setIsExecuting(true);
    setError(null);
    setPlan(null);
    setWorkflowSteps([]);
    setCurrentStepIndex(-1);
    setExecutionComplete(false);
    setExpandedSteps(new Set());

    try {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/workflow/execute-stream`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No reader available");
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const eventData = JSON.parse(line.slice(6));
              handleStreamEvent(eventData);
            } catch (e) {
              console.error("Error parsing SSE data:", e);
            }
          }
        }
      }
    } catch (err) {
      console.error("Error executing workflow:", err);
      setError(
        err instanceof Error ? err.message : "An unknown error occurred"
      );
    } finally {
      setIsExecuting(false);
    }
  };

  const handleStreamEvent = (eventData: any) => {
    const { event, data } = eventData;

    switch (event) {
      case "plan_created":
        setPlan(data);
        const initialSteps = data.steps.map((step: any, index: number) => ({
          stepTitle: `Step ${index + 1}: ${step.description}`,
          requestDetails: {},
          responseDetails: {},
          status: "pending" as const,
        }));
        setWorkflowSteps(initialSteps);
        break;

      case "api_call_completed":
        setWorkflowSteps((prev) => {
          const updated = [...prev];
          const stepIndex = prev.findIndex(
            (step) => step.stepTitle === data.step_title
          );
          if (stepIndex !== -1) {
            updated[stepIndex] = {
              ...updated[stepIndex],
              requestDetails: data.request_details,
              responseDetails: data.response_details,
              status: "completed",
            };
            setCurrentStepIndex(stepIndex);
            setExpandedSteps((prev) => new Set([...prev, stepIndex]));
          }
          return updated;
        });
        break;

      case "data_extracted":
        setWorkflowSteps((prev) => {
          const updated = [...prev];
          const stepIndex = prev.findIndex((step) =>
            step.stepTitle.includes(data.step_title.split(": ")[1])
          );
          if (stepIndex !== -1) {
            updated[stepIndex] = {
              ...updated[stepIndex],
              extractedData: data.extracted_data,
              status: "completed",
            };
          }
          return updated;
        });
        break;

      case "error":
        setError(data.detail);
        setIsExecuting(false);
        break;

      case "end":
        setExecutionComplete(true);
        setIsExecuting(false);
        break;

      default:
        console.log("Unknown event:", event, data);
    }
  };

  const getStatusIcon = (status: WorkflowStep["status"]) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "executing":
        return <Clock className="h-4 w-4 text-blue-500 animate-spin" />;
      case "error":
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: WorkflowStep["status"]) => {
    switch (status) {
      case "completed":
        return (
          <Badge className="bg-green-100 text-green-800 border-green-200">
            200 OK
          </Badge>
        );
      case "executing":
        return (
          <Badge className="bg-blue-100 text-blue-800 border-blue-200">
            Executing...
          </Badge>
        );
      case "error":
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="secondary">Pending</Badge>;
    }
  };

  const formatJson = (obj: any) => {
    try {
      return JSON.stringify(obj, null, 2);
    } catch {
      return String(obj);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-10 sticky top-0">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">APIFlow Tester</h1>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm">
              <User className="h-4 w-4 mr-2" />
              Profile
            </Button>
            <Button variant="ghost" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-65px)]">
        <div className="w-64 border-r bg-muted/20">
          <div className="p-4 space-y-4">
            <Button size="sm" className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              New Workflow
            </Button>
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2">
                Workflows
              </h3>
              <div className="space-y-1">
                {mockWorkflows.map((workflow, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer text-sm"
                  >
                    <span>{workflow.name}</span>
                    {workflow.starred && (
                      <span className="text-yellow-500">★</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2">
                Tools
              </h3>
              <div className="space-y-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-muted-foreground"
                >
                  <History className="h-4 w-4 mr-2" /> History
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-muted-foreground"
                >
                  <Globe className="h-4 w-4 mr-2" /> Environments
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-muted-foreground"
                >
                  <FileText className="h-4 w-4 mr-2" /> Templates
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col bg-white dark:bg-zinc-900 bg-[radial-gradient(theme(colors.slate.200)_1px,transparent_1px)] dark:bg-[radial-gradient(theme(colors.slate.800)_1px,transparent_1px)] [background-size:16px_16px] overflow-hidden">
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="max-w-4xl mx-auto space-y-8">
              <Card className="shadow-lg shadow-black/5 bg-gradient-to-br from-card to-muted/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wand2 className="text-primary" />
                    Describe Your Workflow
                  </CardTitle>
                  <CardDescription>
                    Use natural language to define the steps your API flow
                    should take.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    placeholder="e.g., Log in as 'admin@test.com' with password 'supersecret'. Then, fetch the list of all users. Finally, find the user named 'John Doe' and get their details."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    className="min-h-[120px] text-base focus:ring-2 focus:ring-primary/50"
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={executeWorkflow}
                      disabled={isExecuting || !prompt.trim()}
                      className="shadow-sm"
                    >
                      <Play className="h-4 w-4 mr-2" />
                      {isExecuting ? "Executing..." : "Execute"}
                    </Button>
                    <Button variant="outline" disabled>
                      <Save className="h-4 w-4 mr-2" />
                      Save
                    </Button>
                    <Button variant="outline" disabled>
                      <Share className="h-4 w-4 mr-2" />
                      Share
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {plan && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="h-5 w-5" />
                      Execution Plan
                    </CardTitle>
                    <CardDescription>
                      The generated plan based on your request.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flow-root">
                      <ul className="-mb-4">
                        {plan.steps.map((step, index) => (
                          <li key={index}>
                            <div className="relative pb-4">
                              {index !== plan.steps.length - 1 ? (
                                <span
                                  className="absolute left-[11px] top-4 -ml-px h-full w-0.5 bg-slate-200 dark:bg-slate-700"
                                  aria-hidden="true"
                                />
                              ) : null}
                              <div className="relative flex items-start space-x-3">
                                <div>
                                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary ring-4 ring-background">
                                    {index + 1}
                                  </div>
                                </div>
                                <div className="min-w-0 flex-1 pt-0.5">
                                  <span className="text-sm">
                                    {step.description}
                                  </span>
                                  <p className="text-xs text-muted-foreground font-mono mt-1">
                                    {step.action_type}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              )}

              {error && (
                <Card className="border-red-500/50 bg-red-50 dark:bg-red-950/20">
                  <CardHeader>
                    <CardTitle className="text-red-600 dark:text-red-400 flex items-center gap-2">
                      <XCircle className="h-5 w-5" />
                      An Error Occurred
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="font-mono text-sm text-red-700 dark:text-red-300 bg-red-100/50 dark:bg-red-900/30 p-3 rounded-md">
                      {error}
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          <div className="flex-shrink-0 border-t bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="p-6">
              <div className="max-w-4xl mx-auto">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-lg">Execution Panel</h3>
                  {isExecuting && (
                    <Badge className="bg-blue-100 text-blue-800 border-blue-200 animate-pulse">
                      <Timer className="h-3 w-3 mr-1" />
                      Running...
                    </Badge>
                  )}
                  {workflowSteps.length > 0 && !isExecuting && (
                    <div className="text-sm text-muted-foreground">
                      {
                        workflowSteps.filter((s) => s.status === "completed")
                          .length
                      }{" "}
                      / {workflowSteps.length} steps completed
                    </div>
                  )}
                </div>

                {workflowSteps.length === 0 && !isExecuting ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <Code className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>Run a workflow to see execution results here.</p>
                  </div>
                ) : (
                  <div className="max-h-[50vh] overflow-y-auto">
                    <div className="space-y-3 pb-4">
                      {workflowSteps.map((step, index) => (
                        <Card
                          key={index}
                          className={`transition-all duration-300 ${
                            step.status === "executing"
                              ? "shadow-md shadow-blue-500/20 ring-1 ring-blue-500/50"
                              : step.status === "completed"
                              ? "shadow-sm shadow-green-500/10"
                              : step.status === "error"
                              ? "shadow-sm shadow-red-500/20"
                              : "shadow-sm"
                          }`}
                        >
                          <CardContent className="p-0">
                            <div
                              className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 rounded-t-lg"
                              onClick={() =>
                                step.status === "completed" &&
                                toggleStepExpansion(index)
                              }
                            >
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                {getStatusIcon(step.status)}
                                <h4 className="font-medium text-sm">
                                  {step.stepTitle}
                                </h4>
                              </div>
                              <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                                {getStatusBadge(step.status)}
                                {step.status === "completed" && (
                                  <div className="p-1 rounded-md hover:bg-muted">
                                    {expandedSteps.has(index) ? (
                                      <ChevronDown className="h-4 w-4" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4" />
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            {step.status === "completed" &&
                              expandedSteps.has(index) && (
                                <div className="px-4 pb-4 border-t">
                                  <Tabs
                                    defaultValue="response"
                                    className="w-full"
                                  >
                                    <TabsList className="mt-3">
                                      <TabsTrigger value="request">
                                        Request
                                      </TabsTrigger>
                                      <TabsTrigger value="response">
                                        Response
                                      </TabsTrigger>
                                      <TabsTrigger value="extracted">
                                        Extracted
                                      </TabsTrigger>
                                    </TabsList>
                                    <TabsContent
                                      value="request"
                                      className="mt-3"
                                    >
                                      <div className="border rounded-md">
                                        <pre className="text-xs p-3 bg-muted/70 overflow-auto max-h-64 font-mono whitespace-pre-wrap">
                                          {formatJson(step.requestDetails)}
                                        </pre>
                                      </div>
                                    </TabsContent>
                                    <TabsContent
                                      value="response"
                                      className="mt-3"
                                    >
                                      <div className="border rounded-md">
                                        <pre className="text-xs p-3 bg-muted/70 overflow-auto max-h-64 font-mono whitespace-pre-wrap">
                                          {formatJson(step.responseDetails)}
                                        </pre>
                                      </div>
                                    </TabsContent>
                                    <TabsContent
                                      value="extracted"
                                      className="mt-3"
                                    >
                                      <div className="border rounded-md">
                                        <pre className="text-xs p-3 bg-muted/70 overflow-auto max-h-64 font-mono whitespace-pre-wrap">
                                          {formatJson(step.extractedData || {})}
                                        </pre>
                                      </div>
                                    </TabsContent>
                                  </Tabs>
                                </div>
                              )}
                          </CardContent>
                        </Card>
                      ))}

                      {executionComplete && (
                        <div className="flex items-center gap-3 text-green-700 dark:text-green-400 p-4 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-500/20 mt-4">
                          <CheckCircle className="h-5 w-5" />
                          <span className="font-medium">
                            Workflow completed successfully!
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
