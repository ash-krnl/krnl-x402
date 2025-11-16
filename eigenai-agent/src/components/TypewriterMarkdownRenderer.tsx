import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';

interface TypewriterMarkdownRendererProps {
  content: string;
  speed?: number;
}

export const TypewriterMarkdownRenderer: React.FC<TypewriterMarkdownRendererProps> = ({
  content,
  speed = 20
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

  const renderTypedMarkdown = (text: string) => {
    const lines = text.split('\n');
    const elements: JSX.Element[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Headers
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
      // Bold text
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
      // Lists
      else if (line.startsWith('- ')) {
        elements.push(
          <Box key={i} paddingLeft={1}>
            <Text color="yellow">* </Text>
            <Text color="green">{line.replace('- ', '')}</Text>
          </Box>
        );
      }
      // Numbered lists
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
      // Regular paragraphs
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

    return elements;
  };

  return (
    <>
      {renderTypedMarkdown(displayedText)}
      {currentIndex < content.length && (
        <Text color="green">_</Text>
      )}
    </>
  );
};