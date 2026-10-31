import React from 'react';

interface SafeContentRendererProps {
  content: string;
  className?: string;
}

/**
 * SafeContentRenderer ensures untrusted chat output (e.g. LLM responses or merchant claims)
 * is rendered safely as pure text without interpreting HTML tags, scripts, or executing markdown directives.
 */
export function SafeContentRenderer({ content, className = '' }: SafeContentRendererProps) {
  // Preserve paragraphs and linebreaks without dangerous innerHTML
  const lines = content.split('\n');

  return (
    <div className={`space-y-1.5 text-sm leading-relaxed break-words font-sans ${className}`}>
      {lines.map((line, idx) => {
        if (!line.trim()) {
          return <div key={idx} className="h-2" />;
        }
        return (
          <p key={idx} className="text-gray-200">
            {line}
          </p>
        );
      })}
    </div>
  );
}
