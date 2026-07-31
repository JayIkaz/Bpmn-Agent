// Orval generates two things from the same spec: zod schemas in
// `generated/api` (named after operationIds) and TypeScript types in
// `generated/types` (named after schema components). Those namespaces collide
// whenever an operationId matches a component name — `ClarifyBpmnBody` and
// `ClarifyBpmnResponse` do today, and any new operation could tomorrow.
//
// The zod schemas are this package's purpose, so they keep the bare names. The
// types stay reachable under `Types` (e.g. `Types.BpmnIssue`), which also means
// a future name clash can never reintroduce the ambiguity.
export * from "./generated/api";
export * as Types from "./generated/types";
