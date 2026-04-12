'use client';

import React, { useEffect, useRef } from 'react';
import EditorJS from '@editorjs/editorjs';
import Header from '@editorjs/header';
import List from '@editorjs/list';
import Quote from '@editorjs/quote';
import Delimiter from '@editorjs/delimiter';
import Table from '@editorjs/table';
import CodeTool from '@editorjs/code';
import InlineCode from '@editorjs/inline-code';
import Marker from '@editorjs/marker';
import ImageTool from '@editorjs/image';

interface EditorFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
}

export const EditorField: React.FC<EditorFieldProps> = ({
  value,
  onChange,
  placeholder,
  readOnly = false,
}) => {
  const editorRef    = useRef<EditorJS | null>(null);
  // Points to the wrapper div rendered in JSX; we inject a fresh child div
  // for each EditorJS init so that StrictMode double-invokes never share a holder.
  const containerRef = useRef<HTMLDivElement>(null);
  // Monotonic counter: lets us tell apart a "stale StrictMode init" from the live one.
  const latestInitId = useRef(0);

  useEffect(() => {
    if (!containerRef.current) return;

    const initId = ++latestInitId.current;

    // Give this specific init its own fresh DOM node so that when StrictMode
    // discards the first init and creates a second one, the two EditorJS
    // instances are never touching the same element.
    const holder = document.createElement('div');
    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(holder);

    // Safe JSON parse
    let initialData: { blocks: any[] } = { blocks: [] };
    try {
      const parsed = value ? JSON.parse(value) : null;
      if (parsed && Array.isArray(parsed.blocks)) initialData = parsed;
    } catch {
      // malformed JSON — start blank
    }

    const editor = new EditorJS({
      holder,
      readOnly,
      placeholder: placeholder || 'Write your blog content...',

      tools: {
        header: {
          class: Header as any,
          inlineToolbar: true,
          config: { levels: [1, 2, 3, 4, 5, 6], defaultLevel: 2 },
          toolbox: [
            { title: 'H1', data: { level: 1 } },
            { title: 'H2', data: { level: 2 } },
            { title: 'H3', data: { level: 3 } },
            { title: 'H4', data: { level: 4 } },
          ],
        },
        list: {
          class: List as any,
          inlineToolbar: ['bold', 'italic', 'link'],
        },
        quote:     { class: Quote as any, inlineToolbar: true },
        delimiter: Delimiter as any,
        table:     { class: Table as any, inlineToolbar: true },
        code:      CodeTool,
        inlineCode: InlineCode,
        marker:    Marker,

        // BACKEND REQUIRED: POST /api/upload → { url: string }
        image: {
          class: ImageTool,
          config: {
            uploader: {
              async uploadByFile(file: File) {
                const body = new FormData();
                body.append('file', file);
                const res  = await fetch('/api/upload', { method: 'POST', body });
                const data = await res.json();
                return { success: 1, file: { url: data.url } };
              },
            },
          },
        },
      },

      data: initialData,

      async onChange(api) {
        const saved = await api.saver.save();
        onChange(JSON.stringify(saved));
      },
    });

    // Only promote to editorRef once fully ready.
    // If a newer init has already started (StrictMode), discard this stale one.
    editor.isReady
      .then(() => {
        if (latestInitId.current !== initId) {
          editor.destroy(); // stale — discard silently
          return;
        }
        editorRef.current = editor;
      })
      .catch(() => {});

    return () => {
      editorRef.current = null;
      // On real unmount, destroy if this was the active init.
      // On StrictMode re-run, the id check above already handles cleanup.
      editor.isReady
        .then(() => {
          if (latestInitId.current === initId) editor.destroy();
        })
        .catch(() => {});
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mt-2 border border-gray-200 rounded-xl bg-white min-h-[400px] shadow-inner">
      <div ref={containerRef} className="p-6 prose max-w-none prose-indigo" />
    </div>
  );
};
