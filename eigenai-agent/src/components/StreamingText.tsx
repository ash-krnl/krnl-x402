import React, { useState, useEffect } from 'react';
import { Text } from 'ink';

interface StreamingTextProps {
  content: string;
  speed?: number;
  onComplete?: () => void;
  color?: string;
}

export const StreamingText: React.FC<StreamingTextProps> = ({
  content,
  speed = 20,
  onComplete,
  color = 'white'
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
    } else if (currentIndex === content.length && onComplete) {
      onComplete();
    }
  }, [currentIndex, content, speed, onComplete]);

  // Reset when content changes
  useEffect(() => {
    setDisplayedText('');
    setCurrentIndex(0);
  }, [content]);

  return <Text color={color}>{displayedText}</Text>;
};
