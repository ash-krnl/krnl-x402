import React from 'react';
import { Box, Text } from 'ink';
import { marked } from 'marked';
import { markedTerminal } from 'marked-terminal';

interface ExtensiveMarkdownRendererProps {
  content: string;
}

export const ExtensiveMarkdownRenderer: React.FC<ExtensiveMarkdownRendererProps> = ({ content }) => {
  // Configure marked with 90s terminal styling
  marked.use(markedTerminal({
    // 90s colors and styling
    firstHeading: (text: string) => `\u001b[33m=== ${text.toUpperCase()} ===\u001b[39m`,
    heading: (text: string) => `\u001b[36m--- ${text} ---\u001b[39m`,
    strong: (text: string) => `\u001b[33m${text}\u001b[39m`, // yellow bold
    em: (text: string) => `\u001b[36m${text}\u001b[39m`, // cyan italic
    codespan: (text: string) => `\u001b[32m${text}\u001b[39m`, // green code
    code: (text: string) => `\u001b[32m${text}\u001b[39m`, // green code blocks

    // Lists with 90s style
    list: (body: string) => body,
    listitem: (text: string) => `\u001b[33m*\u001b[39m \u001b[32m${text.replace(/\n$/, '')}\u001b[39m\n`,

    // Tables with simple terminal formatting
    table: (header: string, body: string) => {
      return `\n${header}${body}\n`;
    },

    tablerow: (content: string) => content + '\n',

    tablecell: (content: string, flags: { header: boolean; align?: string }) => {
      if (flags.header) {
        return `\u001b[36m[${content}]\u001b[39m\n`;
      } else {
        return `\u001b[32m  * ${content}\u001b[39m\n`;
      }
    },

    // Paragraphs
    paragraph: (text: string) => `\u001b[32m${text}\u001b[39m\n\n`,

    // Links
    link: (href: string, title: string, text: string) => `\u001b[34m${text}\u001b[39m`,

    // Horizontal rules
    hr: () => `\u001b[90m${'─'.repeat(50)}\u001b[39m\n`,

    // Blockquotes
    blockquote: (text: string) => `\u001b[90m| ${text}\u001b[39m`,

    // Width and formatting
    width: 80,
    showSectionPrefix: false,
    unescape: true,
    emoji: true,

    // Tab handling
    tab: 2
  }));

  try {
    const rendered = marked(content);

    // Split into lines for proper React rendering
    const lines = rendered.split('\n');

    return (
      <Box flexDirection="column">
        {lines.map((line, index) => {
          // Handle empty lines
          if (line.trim() === '') {
            return <Box key={index} height={1} />;
          }

          return (
            <Box key={index}>
              <Text>{line}</Text>
            </Box>
          );
        })}
      </Box>
    );

  } catch (error) {
    console.error('Markdown rendering error:', error);

    // Fallback: Simple green text
    return (
      <Box flexDirection="column">
        {content.split('\n').map((line, index) => (
          <Box key={index}>
            <Text color="green">{line}</Text>
          </Box>
        ))}
      </Box>
    );
  }
};