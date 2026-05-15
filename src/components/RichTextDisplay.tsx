import React from 'react';

interface RichTextDisplayProps {
  content: string;
}

export default function RichTextDisplay({ content }: RichTextDisplayProps) {
  return (
    <div 
      className="rich-text-content" 
      dangerouslySetInnerHTML={{ __html: content }} 
    />
  );
}
