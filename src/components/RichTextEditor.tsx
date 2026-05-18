import { useRef, useEffect, useState } from 'react';

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
}

export default function RichTextEditor({ content, onChange }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [activeCommands, setActiveCommands] = useState({ bold: false, italic: false, list: false });

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== content) {
      editorRef.current.innerHTML = content;
    }
  }, [content]);

  const handleInput = () => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
    updateActiveCommands();
  };

  const exec = (command: string, value?: string) => {
    document.execCommand('styleWithCSS', false, 'false');
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    handleInput();
  };

  const updateActiveCommands = () => {
    setActiveCommands({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      list: document.queryCommandState('insertUnorderedList')
    });
  };

  useEffect(() => {
    const update = () => {
      if (editorRef.current?.contains(document.activeElement)) {
        updateActiveCommands();
      }
    };
    document.addEventListener('selectionchange', update);
    return () => document.removeEventListener('selectionchange', update);
  }, []);

  return (
    <div className="rich-text-editor-container">
      <div className="rich-text-toolbar" aria-label="Formátování textu">
        <button type="button" title="Tučné" aria-pressed={activeCommands.bold} className={`tiny-button ${activeCommands.bold ? 'active' : ''}`} onMouseDown={(e) => { e.preventDefault(); exec('bold'); }}><b>B</b></button>
        <button type="button" title="Kurzíva" aria-pressed={activeCommands.italic} className={`tiny-button ${activeCommands.italic ? 'active' : ''}`} onMouseDown={(e) => { e.preventDefault(); exec('italic'); }}><i>I</i></button>
        <button type="button" title="Odrážky" aria-pressed={activeCommands.list} className={`tiny-button ${activeCommands.list ? 'active' : ''}`} onMouseDown={(e) => { e.preventDefault(); exec('insertUnorderedList'); }}>•</button>
      </div>
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onFocus={updateActiveCommands}
        onKeyUp={updateActiveCommands}
        onMouseUp={updateActiveCommands}
        className="rich-text-editor"
        role="textbox"
        aria-multiline="true"
      />
    </div>
  );
}
