import React, { useRef, useEffect } from 'react';

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
}

export default function RichTextEditor({ content, onChange }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== content) {
      editorRef.current.innerHTML = content;
    }
  }, [content]);

  const handleInput = () => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const exec = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    handleInput();
  };

  return (
    <div className="rich-text-editor-container">
      <div className="toolbar">
        <button type="button" className="tiny-button" onMouseDown={(e) => { e.preventDefault(); exec('bold'); }}><b>B</b></button>
        <button type="button" className="tiny-button" onMouseDown={(e) => { e.preventDefault(); exec('italic'); }}><i>I</i></button>
        <button type="button" className="tiny-button" onMouseDown={(e) => { e.preventDefault(); exec('insertUnorderedList'); }}>List</button>
      </div>
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        className="rich-text-editor"
        role="textbox"
        aria-multiline="true"
      />
    </div>
  );
}
