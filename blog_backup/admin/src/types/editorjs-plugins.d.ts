// Ambient declarations for Editor.js plugin packages that ship no bundled typings.
// These modules export a single class that conforms to the BlockTool / InlineTool
// interface expected by Editor.js — typing them as `any` constructor is sufficient
// for our usage pattern (passing the class reference into the `tools` config object).

declare module '@editorjs/code' {
  const Code: any;
  export default Code;
}

declare module '@editorjs/inline-code' {
  const InlineCode: any;
  export default InlineCode;
}

declare module '@editorjs/marker' {
  const Marker: any;
  export default Marker;
}

declare module '@editorjs/image' {
  const Image: any;
  export default Image;
}
