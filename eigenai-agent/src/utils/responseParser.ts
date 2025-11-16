export function cleanAIResponse(content: string): string {
  // Remove channel/analysis tags and their content
  let cleaned = content.replace(/<\|channel\|>.*?<\|end\|>/gs, '');

  // Remove any remaining formatting tags
  cleaned = cleaned.replace(/<\|.*?\|>/g, '');

  // Clean up extra whitespace and newlines
  cleaned = cleaned.trim().replace(/\n\s*\n/g, '\n');

  return cleaned;
}