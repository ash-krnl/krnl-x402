import React, { useState, useEffect } from 'react';
import { Text } from 'ink';

interface TypewriterSimpleMarkdownProps {
  content: string;
  speed?: number;
}

export const TypewriterSimpleMarkdown: React.FC<TypewriterSimpleMarkdownProps> = ({
  content,
  speed = 15
}) => {
  const [displayedText, setDisplayedText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (currentIndex < content.length) {
      const timer = setTimeout(() => {
        setDisplayedText(prev => prev + content[currentIndex]);
        setCurrentIndex(prev => prev + 1);
      }, speed);

      return () => clearTimeout(timer);
    }
  }, [currentIndex, content, speed]);

  // Convert markdown tables to simple 90s terminal format
  const formatFor90sTerminal = (text: string) => {
    // Replace HTML breaks with newlines
    let formatted = text.replace(/<br>/g, '\n');

    // Convert markdown tables to simple list format
    const lines = formatted.split('\n');
    let result = '';
    let inTable = false;
    let isHeaderRow = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Detect table rows
      if (line.includes('|') && line.split('|').length > 2) {
        const cells = line.split('|').map(cell => cell.trim()).filter(cell => cell);

        // Skip separator rows (---|---|---)
        if (line.includes('---')) {
          continue;
        }

        if (!inTable) {
          inTable = true;
          isHeaderRow = true;
          result += '\n'; // Add space before table
        }

        // Format cells for 90s terminal
        if (isHeaderRow) {
          // Headers in yellow
          cells.forEach((cell, index) => {
            result += `[${index + 1}] ${cell}\n`;
          });
          result += '\n';
          isHeaderRow = false;
        } else {
          // Data rows with bullet points
          cells.forEach((cell, index) => {
            if (cell) {
              result += `    * ${cell}\n`;
            }
          });
          result += '\n';
        }
      } else {
        // Not a table line
        if (inTable) {
          inTable = false;
          result += '\n'; // Add space after table
        }
        result += line + '\n';
      }
    }

    return result;
  };

  const formattedText = formatFor90sTerminal(displayedText);

  return (
    <>
      <Text color="green">{formattedText}</Text>
      {currentIndex < content.length && (
        <Text color="green">_</Text>
      )}
    </>
  );
};