import { tool } from '@opencode-ai/plugin';

type ToolDefinition = Parameters<typeof tool>[0];

const CONFIRMATION_ERROR =
  'Error: This tool requires explicit user confirmation (confirmed_by_user=true).';

export function withUserConfirmation(
  name: string,
  allowedTools: Set<string>,
  definition: ToolDefinition
) {
  const args = {
    ...definition.args,
    confirmed_by_user: tool.schema
      .boolean()
      .optional()
      .describe('Set true when the user explicitly requested this tool call.'),
  };

  return tool({
    ...definition,
    args,
    async execute(args, context) {
      const confirmed = Boolean(args.confirmed_by_user);
      if (!allowedTools.has(name) && !confirmed) {
        return CONFIRMATION_ERROR;
      }
      try {
        return await definition.execute(args, context);
      } catch (error) {
        if (error instanceof Error) {
          return error.message;
        }
        return 'Error: Tool execution failed.';
      }
    },
  });
}
