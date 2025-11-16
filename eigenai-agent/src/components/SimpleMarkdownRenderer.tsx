import React from 'react';
import { Box, Text } from 'ink';
import { marked } from 'marked';
import { markedTerminal } from 'marked-terminal';

interface SimpleMarkdownRendererProps {
  content: string;
}

export const SimpleMarkdownRenderer: React.FC<SimpleMarkdownRendererProps> = ({ content }) => {
  // Configure marked for terminal output with 90s styling
  marked.setOptions({
    renderer: markedTerminal({
      // 90s terminal colors
      strong: (text) => `\u001b[33m${text}\u001b[39m`, // yellow for bold
      em: (text) => `\u001b[36m${text}\u001b[39m`, // cyan for italic
      codespan: (text) => `\u001b[32m${text}\u001b[39m`, // green for code
      del: (text) => `\u001b[31m${text}\u001b[39m`, // red for strikethrough

      // Headers with 90s style
      heading: (text, level) => {
        switch (level) {
          case 1: return `\u001b[33m=== ${text.toUpperCase()} ===\u001b[39m\n`;
          case 2: return `\u001b[36m--- ${text} ---\u001b[39m\n`;
          case 3: return `\u001b[35m* ${text}\u001b[39m\n`;
          default: return `\u001b[32m${text}\u001b[39m\n`;
        }
      },

      // Lists with 90s style
      list: (body) => body,
      listitem: (text) => `\u001b[32m${text}\u001b[39m\n`,

      // Tables with simple formatting
      table: (header, body) => `${header}${body}\n`,
      tablerow: (content) => `${content}\n`,
      tablecell: (content, flags) => {
        const color = flags.header ? '\u001b[36m' : '\u001b[32m';
        return `${color}${content}\u001b[39m | `;
      },

      // Code blocks
      code: (code) => `\u001b[32m${code}\u001b[39m\n`,

      // Paragraphs
      paragraph: (text) => `\u001b[32m${text}\u001b[39m\n`,

      // Links
      link: (href, title, text) => `\u001b[34m${text}\u001b[39m`,
    })
  });

  try {
    const rendered = marked(content);
    // Split by lines and render each line
    const lines = rendered.split('\n');

    return (
      <Box flexDirection="column">
        {lines.map((line, index) => (
          <Box key={index}>
            <Text>{line}</Text>
          </Box>
        ))}
      </Box>
    );
  } catch (error) {
    // Fallback to plain text with green color
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