import React, { useState, useEffect } from 'react';
import { Text } from 'ink';

interface TypewriterTextProps {
  text: string;
  speed?: number;
  color?: string;
  bold?: boolean;
}

export const TypewriterText: React.FC<TypewriterTextProps> = ({
  text,
  speed = 30,
  color = 'green',
  bold = false
}) => {
  const [displayedText, setDisplayedText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (currentIndex < text.length) {
      const timer = setTimeout(() => {
        setDisplayedText(prev => prev + text[currentIndex]);
        setCurrentIndex(prev => prev + 1);
      }, speed);

      return () => clearTimeout(timer);
    }
  }, [currentIndex, text, speed]);

  return <Text color={color} bold={bold}>{displayedText}</Text>;
};