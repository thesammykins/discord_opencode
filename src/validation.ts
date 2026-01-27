export const DISCORD_LIMITS = {
  messageContent: 2000,
  buttonLabel: 80,
  buttonCustomId: 100,
  buttonsPerRow: 5,
  embedTitle: 256,
  embedDescription: 4096,
  embedFieldName: 256,
  embedFieldValue: 1024,
  embedFooter: 2048,
  embedFields: 25,
  embedTotal: 6000,
};

export interface EmbedFieldInput {
  name: string;
  value: string;
  inline?: boolean;
}

export interface EmbedLengthInput {
  title?: string;
  description?: string;
  footer?: string;
  fields?: EmbedFieldInput[];
}

export interface ButtonInput {
  label: string;
  id: string;
}

export function validateContentLength(
  content: string,
  limit = DISCORD_LIMITS.messageContent,
  label = 'Content'
): string | null {
  if (content.length > limit) {
    return `Error: ${label} exceeds ${limit} characters`;
  }
  return null;
}

export function validateButtonPrompt(prompt: string): string | null {
  return validateContentLength(prompt, DISCORD_LIMITS.messageContent, 'Prompt');
}

export function validateButtons(buttons: ButtonInput[]): string | null {
  if (buttons.length > DISCORD_LIMITS.buttonsPerRow) {
    return `Error: Maximum ${DISCORD_LIMITS.buttonsPerRow} buttons per row`;
  }

  for (const button of buttons) {
    if (button.id.length > DISCORD_LIMITS.buttonCustomId) {
      return `Error: Button id "${button.id.slice(0, 20)}..." exceeds ${DISCORD_LIMITS.buttonCustomId} chars`;
    }
    if (button.label.length > DISCORD_LIMITS.buttonLabel) {
      return `Error: Button label "${button.label.slice(0, 20)}..." exceeds ${DISCORD_LIMITS.buttonLabel} chars`;
    }
  }

  return null;
}

export function validateField(field: EmbedFieldInput): string | null {
  if (!field.name || field.name.length === 0) {
    return 'Error: Field name cannot be empty';
  }
  if (!field.value || field.value.length === 0) {
    return 'Error: Field value cannot be empty';
  }
  if (field.name.length > DISCORD_LIMITS.embedFieldName) {
    return `Error: Field name "${field.name.slice(0, 20)}..." exceeds ${DISCORD_LIMITS.embedFieldName} chars`;
  }
  if (field.value.length > DISCORD_LIMITS.embedFieldValue) {
    return `Error: Field value exceeds ${DISCORD_LIMITS.embedFieldValue} chars`;
  }
  return null;
}

export function validateEmbedLength(embed: EmbedLengthInput): string | null {
  let totalLength = 0;

  if (embed.title) totalLength += embed.title.length;
  if (embed.description) totalLength += embed.description.length;
  if (embed.footer) totalLength += embed.footer.length;
  if (embed.fields) {
    for (const field of embed.fields) {
      totalLength += field.name.length + field.value.length;
    }
  }

  if (totalLength > DISCORD_LIMITS.embedTotal) {
    return `Error: Total embed length (${totalLength}) exceeds ${DISCORD_LIMITS.embedTotal} characters`;
  }

  return null;
}
