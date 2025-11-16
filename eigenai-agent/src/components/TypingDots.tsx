import React, { useState, useEffect } from 'react';
import { Text } from 'ink';

interface TypingDotsProps {
  color?: string;
  speed?: number;
}

export const TypingDots: React.FC<TypingDotsProps> = ({ color = 'cyan', speed = 500 }) => {
  const [dots, setDots] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => {
        if (prev === '...') {
          return '';
        }
        return prev + '.';
      });
    }, speed);

    return () => clearInterval(interval);
  }, [speed]);

  return <Text color={color}>ai typing{dots}</Text>;
};