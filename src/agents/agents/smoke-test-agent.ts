import { defineAgent } from "../registry";
import { defineTool } from "../tool";

/**
 * Dummy agent used only to prove the orchestration substrate end to end
 * (AKR-8 acceptance criteria). Not a real workflow — see AGENTS.md's
 * non-goal on building real agent workflows in this issue.
 */

export const dummyEchoTool = defineTool<{ message: string }, { echoed: string }>({
  name: "dummy.echo",
  description: "Smoke-test tool. Uppercases the input message. No side effects.",
  irreversible: false,
  handler: async ({ message }) => ({ echoed: message.toUpperCase() }),
});

export const dummySendTestNotificationTool = defineTool<
  { message: string },
  { sent: boolean; message: string }
>({
  name: "dummy.sendTestNotification",
  description:
    "Smoke-test tool simulating an external notification send. Not wired to a real provider — " +
    "exists to prove the HITL gate blocks irreversible tool calls until an operator approves.",
  irreversible: true,
  handler: async ({ message }) => ({ sent: true, message }),
});

export const smokeTestAgent = defineAgent({
  name: "smoke-test-agent",
  description: "Calls one reversible and one irreversible dummy tool to exercise the substrate.",
  scope: "No real business tools — only the dummy.* smoke-test tools below.",
  tools: [dummyEchoTool, dummySendTestNotificationTool],
  async run(ctx) {
    await ctx.callTool("dummy.echo", { message: "substrate online" });
    await ctx.callTool("dummy.sendTestNotification", {
      message: "hello from the smoke test agent",
    });
  },
});
