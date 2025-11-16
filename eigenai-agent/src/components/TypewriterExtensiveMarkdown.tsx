import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text } from 'ink';
import { marked } from 'marked';
import { markedTerminal } from 'marked-terminal';

interface TypewriterExtensiveMarkdownProps {
  content: string;
  speed?: number;
}

export const TypewriterExtensiveMarkdown: React.FC<TypewriterExtensiveMarkdownProps> = ({
  content,
  speed = 15
}) => {
  const [displayedText, setDisplayedText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [renderedLines, setRenderedLines] = useState<string[]>([]);

  // Handle ASCII table format from the response
  const parseMarkdownSimple = useCallback((text: string): string => {
    let lines = text.split('\n');
    let result = '';
    let inAsciiTable = false;
    let tableHeaders: string[] = [];
    let tableData: { [header: string]: string[] } = {};

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Detect ASCII table start (┌─ or ┏━)
      if (line.includes('┌') || line.includes('┏')) {
        inAsciiTable = true;
        continue;
      }

      // Detect ASCII table end (└─ or ┗━)
      if (line.includes('└') || line.includes('┗')) {
        inAsciiTable = false;

        // Process collected table data
        if (tableHeaders.length > 0) {
          result += '\n';
          tableHeaders.forEach((header, index) => {
            // Clean up header and extract emoji if present
            let cleanHeader = header.replace(/&amp;/g, '&').trim();

            // Extract emoji from header for special formatting
            const emojiMatch = cleanHeader.match(/^([🎨📈🧭💻🔧⚡🎯📊🎮🎪🎭🔍📝💡🚀]+)\s*(.+)/);
            if (emojiMatch) {
              cleanHeader = `${emojiMatch[1]} ${emojiMatch[2]}`;
            }

            result += `[${index + 1}] ${cleanHeader}\n`;

            const items = tableData[header] || [];
            items.forEach(item => {
              if (item && item.trim() && !item.includes('─')) {
                // Clean bold formatting and HTML entities
                let cleanItem = item.replace(/&amp;/g, '&')
                                   .replace(/\*\*(.*?)\*\*/g, '$1')
                                   .trim();
                if (cleanItem) {
                  result += `    * ${cleanItem}\n`;
                }
              }
            });
            result += '\n';
          });
        }

        // Reset table data
        tableHeaders = [];
        tableData = {};
        continue;
      }

      // Inside ASCII table
      if (inAsciiTable) {
        // Skip table border lines (├─ ┼─ etc)
        if (line.includes('├') || line.includes('┼') || line.includes('─') || line.includes('━')) {
          continue;
        }

        // Extract table content from lines with │
        if (line.includes('│')) {
          const cells = line.split('│')
            .map(cell => cell.trim())
            .filter(cell => cell && !cell.match(/^[─━┌┐└┘├┤┬┴┼]+$/));

          if (cells.length > 0) {
            // First content row becomes headers
            if (tableHeaders.length === 0) {
              tableHeaders = cells;
              tableHeaders.forEach(header => {
                tableData[header] = [];
              });
            } else {
              // Add data to each column
              cells.forEach((cell, index) => {
                if (index < tableHeaders.length && cell.trim()) {
                  tableData[tableHeaders[index]].push(cell);
                }
              });
            }
          }
        }
        continue;
      }

      // Regular content processing (not in table)
      if (!inAsciiTable) {
        const trimmedLine = line.trim();

        // Check for markdown table rows (| delimited)
        if (trimmedLine.includes('|') && trimmedLine.split('|').length > 2) {
          const cells = trimmedLine.split('|').map(cell => cell.trim()).filter(cell => cell);

          // Skip separator rows (---|---|---)
          if (trimmedLine.includes('---')) {
            continue;
          }

          if (cells.length >= 2) {
            // Format as header and content
            const header = cells[0];
            const content = cells[1];

            // Clean up header
            let cleanHeader = header.replace(/&amp;/g, '&').trim();
            const emojiMatch = cleanHeader.match(/^([🎨📈🧭💻🔧⚡🎯📊🎮🎪🎭🔍📝💡🚀]+)\s*(.+)/);
            if (emojiMatch) {
              cleanHeader = `${emojiMatch[1]} ${emojiMatch[2]}`;
            }

            result += `\n[${cleanHeader}]\n`;

            // Process content with <br> tags and bold formatting
            let cleanContent = content.replace(/&amp;/g, '&')
                                     .replace(/\*\*(.*?)\*\*/g, '$1')
                                     .replace(/<br>/g, '\n    * ');

            // Split by bullet points if they exist
            if (cleanContent.includes('•')) {
              const items = cleanContent.split('•').filter(item => item.trim());
              items.forEach(item => {
                if (item.trim()) {
                  result += `    * ${item.trim()}\n`;
                }
              });
            } else {
              // Split by <br> converted newlines
              const items = cleanContent.split('\n    * ').filter(item => item.trim());
              items.forEach(item => {
                if (item.trim()) {
                  result += `    * ${item.trim()}\n`;
                }
              });
            }
            result += '\n';
          }
          continue;
        }

        // Headers with ---
        if (trimmedLine.startsWith('---') && trimmedLine.endsWith('---')) {
          const headerText = trimmedLine.replace(/^---\s*/, '').replace(/\s*---$/, '');
          result += `\n--- ${headerText} ---\n\n`;
        }
        // Handle markdown headers
        else if (trimmedLine.startsWith('#### ')) {
          result += `\n--- ${trimmedLine.replace('#### ', '')} ---\n\n`;
        } else if (trimmedLine.startsWith('### ')) {
          result += `\n--- ${trimmedLine.replace('### ', '')} ---\n\n`;
        } else if (trimmedLine.startsWith('## ')) {
          result += `\n--- ${trimmedLine.replace('## ', '')} ---\n\n`;
        } else if (trimmedLine.startsWith('# ')) {
          result += `\n=== ${trimmedLine.replace('# ', '').toUpperCase()} ===\n\n`;
        }
        // Lists
        else if (trimmedLine.match(/^[*\-]\s/)) {
          result += `  * ${trimmedLine.replace(/^[*\-]\s/, '')}\n`;
        }
        // Numbered lists
        else if (trimmedLine.match(/^\d+\.\s/)) {
          result += `  ${trimmedLine}\n`;
        }
        // Horizontal rules
        else if (trimmedLine.match(/^[─━]{3,}$/)) {
          result += `${'─'.repeat(50)}\n`;
        }
        // Regular content
        else if (trimmedLine.length > 0) {
          // Clean up HTML entities and formatting
          let cleanLine = trimmedLine.replace(/&amp;/g, '&').replace(/‑/g, '-');

          // Handle bold text **text**
          if (cleanLine.includes('**')) {
            cleanLine = cleanLine.replace(/\*\*(.*?)\*\*/g, '$1');
          }

          // Check if this might be an emoji header that wasn't in a table
          const emojiHeaderMatch = cleanLine.match(/^([🎨📈🧭💻🔧⚡🎯📊🎮🎪🎭🔍📝💡🚀]+)\s*(.+)/);
          if (emojiHeaderMatch) {
            result += `\n--- ${emojiHeaderMatch[1]} ${emojiHeaderMatch[2]} ---\n\n`;
          } else {
            result += `${cleanLine}\n`;
          }
        }
        // Empty lines
        else {
          result += '\n';
        }
      }
    }

    return result;
  }, []);

  // Typewriter effect
  useEffect(() => {
    if (currentIndex < content.length) {
      const timer = setTimeout(() => {
        setDisplayedText(prev => prev + content[currentIndex]);
        setCurrentIndex(prev => prev + 1);
      }, speed);

      return () => clearTimeout(timer);
    }
  }, [currentIndex, content, speed]);

  // Render markdown as we type
  useEffect(() => {
    if (displayedText) {
      try {
        const rendered = parseMarkdownSimple(displayedText);
        const lines = rendered.split('\n');


        setRenderedLines(lines);
      } catch (error) {
        // Fallback to raw text if markdown parsing fails
        setRenderedLines(displayedText.split('\n'));
      }
    }
  }, [displayedText, parseMarkdownSimple, currentIndex, content]);

  return (
    <Box flexDirection="column">
      {renderedLines.map((line, index) => {
        // Handle empty lines
        if (line.trim() === '') {
          return <Box key={index} height={1} />;
        }

        // Apply 90s terminal colors based on content
        let color = 'green'; // Default green
        let bold = false;

        if (line.includes('===') && line.includes('===')) {
          color = 'yellow';
          bold = true;
        } else if (line.includes('---') && line.includes('---')) {
          color = 'cyan';
          bold = true;
        } else if (line.startsWith('*') || line.includes('    *')) {
          color = 'green';
        } else if (line.startsWith('[') && line.includes(']')) {
          color = 'cyan';
          bold = true;
        } else if (line.includes('─')) {
          color = 'gray';
        } else if (line.match(/^\d+\.\s/)) {
          // Numbered lists
          color = 'white';
        } else if (line.match(/^[🎨📈🧭💻🔧⚡🎯📊🎮🎪🎭🎨🎯🔍📝💡🚀]/)) {
          // Emoji headers that weren't caught by --- format
          color = 'cyan';
          bold = true;
        }

        return (
          <Box key={index}>
            <Text color={color} bold={bold}>{line}</Text>
          </Box>
        );
      })}

      {currentIndex < content.length && (
        <Text color="green">_</Text>
      )}
    </Box>
  );
};