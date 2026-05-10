# 🧠 Tutorial: Integrating Editor.js (Production-Ready CMS Editor)

This guide shows how to integrate **Editor.js** into a Next.js Admin Panel and build a **modern, SEO-friendly blog editor**.

Unlike traditional editors (TinyMCE, Quill), Editor.js stores **structured JSON**, allowing you to generate **clean, fast, semantic HTML** for SSR.

---

# 🚀 Why Editor.js?

✅ Clean structured data (JSON)
✅ No messy HTML / inline styles
✅ Perfect for SEO + SSR
✅ Block-based (like Notion / Medium)
✅ Lightweight & customizable

---

# 📦 1. Installation

Run inside your `admin/` project:

```bash
npm install @editorjs/editorjs \
@editorjs/header \
@editorjs/list \
@editorjs/quote \
@editorjs/delimiter \
@editorjs/table \
@editorjs/code \
@editorjs/inline-code \
@editorjs/marker \
@editorjs/image
```

---

# 🧩 2. Create Editor Component (Production Version)

Create:

```
admin/src/components/EditorField.tsx
```

```tsx
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
  const editorRef = useRef<EditorJS | null>(null);
  const holderId = useRef(`editorjs-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    if (editorRef.current) return;

    let initialData = {};
    try {
      initialData = value ? JSON.parse(value) : {};
    } catch {
      initialData = {};
    }

    const editor = new EditorJS({
      holder: holderId.current,
      readOnly,

      placeholder: placeholder || 'Write your blog content...',

      tools: {
        header: {
          class: Header,
          inlineToolbar: true,
          config: {
            levels: [1, 2, 3, 4, 5, 6],
            defaultLevel: 2,
          },
          toolbox: [
            { title: 'H1', data: { level: 1 } },
            { title: 'H2', data: { level: 2 } },
            { title: 'H3', data: { level: 3 } },
          ],
        },

        list: {
          class: List,
          inlineToolbar: ['bold', 'italic', 'link'],
        },

        quote: {
          class: Quote,
          inlineToolbar: true,
        },

        delimiter: Delimiter,

        table: {
          class: Table,
          inlineToolbar: true,
        },

        code: CodeTool,
        inlineCode: InlineCode,
        marker: Marker,

        image: {
          class: ImageTool,
          config: {
            uploader: {
              async uploadByFile(file: File) {
                const formData = new FormData();
                formData.append('file', file);

                const res = await fetch('/api/upload', {
                  method: 'POST',
                  body: formData,
                });

                const data = await res.json();

                return {
                  success: 1,
                  file: {
                    url: data.url,
                  },
                };
              },
            },
          },
        },
      },

      async onChange(api) {
        const savedData = await api.saver.save();
        onChange(JSON.stringify(savedData));
      },
    });

    editorRef.current = editor;

    return () => {
      editor.destroy();
      editorRef.current = null;
    };
  }, []);

  return (
    <div className="mt-2 border rounded-xl bg-white min-h-[400px]">
      <div className="p-6 prose max-w-none">
        <div id={holderId.current} />
      </div>
    </div>
  );
};
```

---

# 🔌 3. Integrate in Admin Page

```tsx
import { EditorField } from '@/components/EditorField';

if (field.type === 'TextField' && ['content', 'body'].includes(fieldName)) {
  return (
    <EditorField
      value={value}
      onChange={(newValue) =>
        setFormData({ ...formData, [fieldName]: newValue })
      }
    />
  );
}
```

---

# 🗄️ 4. Database Storage

```ts
content: string; // JSON string from Editor.js
```

---

# 🌐 5. Render Content (SEO + SSR)

Install parser:

```bash
npm install editorjs-html
```

```tsx
import edjsHTML from 'editorjs-html';

const parser = edjsHTML();

const html = parser.parse(JSON.parse(post.content)).join('');

return <article dangerouslySetInnerHTML={{ __html: html }} />;
```

---

# ⚡ 6. Performance & SEO Best Practices

## ✅ Always Use SSR

* Next.js `getStaticProps` (best for blogs)
* Pre-render pages

## ✅ Keep HTML Clean

* Editor.js → already clean
* Avoid inline styles

## ✅ Proper Structure

* H1 → H2 → H3 hierarchy
* Use lists, quotes, tables properly

## ✅ Optimize Images

* Use Next.js `<Image />` if possible
* Store width/height

---

# 🚨 7. Common Mistakes

❌ Rendering JSON directly in frontend
❌ Not handling invalid JSON
❌ Using too many plugins
❌ Mixing Editor.js with raw HTML

---

# 🧠 8. Architecture Overview

```
Editor.js (Admin)
   ↓
JSON (DB)
   ↓
Backend / Next.js SSR
   ↓
Clean HTML
   ↓
Fast SEO-friendly Blog Page
```

---

# 🎯 Final Result

You now have:

✅ Modern block editor (Notion-style)
✅ Clean JSON storage
✅ Fast SSR HTML output
✅ SEO-optimized blog system
✅ Scalable CMS architecture

---

# 🚀 Next Steps (Recommended)

* Add SEO analyzer (H1/H2 checker)
* Add slug + meta fields
* Add schema.org JSON-LD
* Build content preview page
* Add autosave + drafts

---

💡 This setup is similar to how modern CMS platforms work internally (Notion, Medium, etc.)
