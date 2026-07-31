import Anthropic from "@anthropic-ai/sdk";

/**
 * Shared Anthropic client.
 *
 * Credentials resolve from the environment in this order: `ANTHROPIC_API_KEY`,
 * `ANTHROPIC_AUTH_TOKEN`, then an `ant auth login` profile on disk. An unset
 * `ANTHROPIC_API_KEY` does not mean there are no credentials, so this
 * deliberately does not check for one — the SDK resolves them per request.
 */
export const anthropic = new Anthropic();

/** Model used by every BPMN route. */
export const BPMN_MODEL = "claude-opus-5";
