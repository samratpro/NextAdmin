# Tutorial: Integrating Editor.js for Rich Text Editing

This tutorial will guide you through adding a powerful, block-based rich text editor (Editor.js) to your Admin Panel. Unlike traditional editors that produce messy HTML, Editor.js stores data as structured JSON, making it perfect for modern applications.

---

## 1. Installation

First, install the core library and some common plugins in the `admin` project. Open your terminal in `admin/` and run:

```bash
npm install @editorjs/editorjs @editorjs/header @editorjs/list @editorjs/quote @editorjs/delimiter @editorjs/table
```

---

## 2. Creating the React Component

Since Editor.js is a vanilla JavaScript library, we need to wrap it in a React component. Create a new file: `admin/src/components/EditorField.tsx`.

```tsx
'use client';

import React, { useEffect, useRef } from 'react';
import EditorJS from '@editorjs/editorjs';
import Header from '@editorjs/header';
import List from '@editorjs/list';
import Quote from '@editorjs/quote';
import Delimiter from '@editorjs/delimiter';
import Table from '@editorjs/table';

interface EditorFieldProps {
  value: string; // We store the JSON as a string in the DB
  onChange: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
}

export const EditorField: React.FC<EditorFieldProps> = ({ value, onChange, placeholder, readOnly = false }) => {
  const editorRef = useRef<EditorJS | null>(null);
  const holderId = useRef(`editorjs-${Math.random().toString(36).substr(2, 9)}`);

  useEffect(() => {
    // Initialise Editor.js
    if (!editorRef.current) {
      const editor = new EditorJS({
        holder: holderId.current,
        tools: {
          header: { class: Header, inlineToolbar: true },
          list: { class: List, inlineToolbar: true },
          quote: { class: Quote, inlineToolbar: true },
          delimiter: Delimiter,
          table: { class: Table, inlineToolbar: true },
        },
        data: value ? JSON.parse(value) : {},
        placeholder: placeholder || 'Start typing your content...',
        readOnly: readOnly,
        async onChange(api) {
          const savedData = await api.saver.save();
          onChange(JSON.stringify(savedData));
        },
      });

      editorRef.current = editor;
    }

    // Clean up on unmount
    return () => {
      if (editorRef.current && typeof editorRef.current.destroy === 'function') {
        editorRef.current.destroy();
        editorRef.current = null;
      }
    };
  }, []);

  return (
    <div className="mt-2 block w-full border border-gray-200 rounded-xl shadow-inner bg-white overflow-hidden min-h-[300px] border-b-4 border-indigo-50">
      <div className="p-6 prose max-w-none prose-indigo">
        <div id={holderId.current} />
      </div>
    </div>
  );
};
```

---

## 3. Integrating with the Admin Page

Modify `admin/src/app/dashboard/models/[modelName]/page.tsx` to handle specific fields with the editor.

### 1. Import the New Component
```tsx
import { EditorField } from '@/components/EditorField';
```

### 2. Update `renderFieldInput`
Find the `renderFieldInput` function and add a condition for your rich text fields:

```tsx
// Inside renderFieldInput
if (field.type === 'TextField' && (fieldName === 'content' || fieldName === 'body')) {
    return (
        <EditorField
            value={value}
            onChange={(newValue) => setFormData({ ...formData, [fieldName]: newValue })}
        />
    );
}
```

---

## 4. Storing Data in the Database

In your `api` models, ensure the field is a `TextField`. 

```typescript
// api/src/apps/blog/models.ts
export class BlogPost extends Model {
    @Field({ type: 'TextField', verboseName: 'Post Content' })
    content: string; 
}
```

---

## 5. Rendering JSON to HTML (Public Frontend)

To display the saved JSON on your public website, use a parser like `editorjs-html`:

```bash
npm install editorjs-html
```

Example usage:
```tsx
import edjsHTML from 'editorjs-html';
const edjsParser = edjsHTML();

const htmlContent = edjsParser.parse(JSON.parse(post.content));
return <div dangerouslySetInnerHTML={{ __html: htmlContent.join('') }} />;
```
