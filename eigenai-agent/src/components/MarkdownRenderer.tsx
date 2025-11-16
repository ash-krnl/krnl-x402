import React from 'react';
import { Box, Text } from 'ink';

interface MarkdownRendererProps {
  content: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  const renderMarkdown = (text: string) => {
    const lines = text.split('\n');
    const elements: JSX.Element[] = [];
    let inCodeBlock = false;
    let inTable = false;
    let tableRows: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Code blocks
      if (line.startsWith('```')) {
        if (inCodeBlock) {
          inCodeBlock = false;
        } else {
          inCodeBlock = true;
          elements.push(
            <Box key={i} marginTop={1}>
              <Text color="gray" bold>Code:</Text>
            </Box>
          );
        }
        continue;
      }

      if (inCodeBlock) {
        elements.push(
          <Box key={i} borderStyle="round" borderColor="gray" paddingX={2} paddingY={0} marginY={0}>
            <Text color="green">{line}</Text>
          </Box>
        );
        continue;
      }

      // Tables
      if (line.includes('|') && line.trim().length > 0) {
        if (!inTable) {
          inTable = true;
          tableRows = [];
        }
        tableRows.push(line);
        continue;
      } else if (inTable) {
        // End of table, render it
        elements.push(renderTable(tableRows, i));
        inTable = false;
        tableRows = [];
      }

      // Headers - 90s Style
      if (line.startsWith('# ')) {
        elements.push(
          <Box key={i} marginY={1}>
            <Text color="yellow" bold>=== {line.replace('# ', '').toUpperCase()} ===</Text>
          </Box>
        );
      } else if (line.startsWith('## ')) {
        elements.push(
          <Box key={i} marginY={1}>
            <Text color="cyan" bold>--- {line.replace('## ', '')} ---</Text>
          </Box>
        );
      } else if (line.startsWith('### ')) {
        elements.push(
          <Box key={i}>
            <Text color="magenta" bold>* {line.replace('### ', '')}</Text>
          </Box>
        );
      }
      // Bold text - 90s Style
      else if (line.includes('**')) {
        const parts = line.split('**');
        const textElements = parts.map((part, index) => (
          <Text key={index} color={index % 2 === 1 ? "yellow" : "green"} bold={index % 2 === 1}>
            {part}
          </Text>
        ));
        elements.push(
          <Box key={i}>
            {textElements}
          </Box>
        );
      }
      // Lists - 90s Style
      else if (line.startsWith('- ')) {
        elements.push(
          <Box key={i} paddingLeft={1}>
            <Text color="yellow">* </Text>
            <Text color="green">{line.replace('- ', '')}</Text>
          </Box>
        );
      }
      // Numbered lists - 90s Style
      else if (/^\d+\.\s/.test(line)) {
        const match = line.match(/^(\d+)\.\s(.*)$/);
        if (match) {
          elements.push(
            <Box key={i} paddingLeft={1}>
              <Text color="cyan" bold>[{match[1]}] </Text>
              <Text color="green">{match[2]}</Text>
            </Box>
          );
        }
      }
      // Regular paragraphs - 90s Style
      else if (line.trim().length > 0) {
        elements.push(
          <Box key={i} marginBottom={line.trim().length > 60 ? 1 : 0}>
            <Text color="green">{line}</Text>
          </Box>
        );
      }
      // Empty lines
      else {
        elements.push(<Box key={i} height={1} />);
      }
    }

    // Handle remaining table if we're still in one
    if (inTable && tableRows.length > 0) {
      elements.push(renderTable(tableRows, lines.length));
    }

    return elements;
  };

  const renderTable = (rows: string[], key: number) => {
    const headerRow = rows[0];
    const separatorRow = rows[1];
    const dataRows = rows.slice(2);

    const headers = headerRow.split('|').map(h => h.trim()).filter(h => h);
    const colWidths = headers.map(h => Math.max(h.length, 15));

    return (
      <Box key={key} borderStyle="round" borderColor="gray" padding={1} marginY={1}>
        {/* Header */}
        <Box marginBottom={1}>
          {headers.map((header, i) => (
            <Box key={i} marginRight={3} minWidth={colWidths[i]}>
              <Text color="cyan" bold>{header}</Text>
            </Box>
          ))}
        </Box>

        {/* Separator line */}
        <Box marginBottom={1}>
          <Text color="gray">{'─'.repeat(60)}</Text>
        </Box>

        {/* Data rows */}
        {dataRows.map((row, rowIndex) => {
          const cells = row.split('|').map(c => c.trim()).filter(c => c);
          return (
            <Box key={rowIndex} marginBottom={1}>
              {cells.map((cell, cellIndex) => (
                <Box key={cellIndex} marginRight={3} minWidth={colWidths[cellIndex] || 15}>
                  <Text color="white">{cell}</Text>
                </Box>
              ))}
            </Box>
          );
        })}
      </Box>
    );
  };

  return (
    <Box flexDirection="column">
      {renderMarkdown(content)}
    </Box>
  );
};