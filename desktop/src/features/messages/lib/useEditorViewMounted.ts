import * as React from "react";

import type { Editor } from "@tiptap/react";

/**
 * Whether the editor's view is currently attached and safe to read.
 *
 * tiptap exposes `editor.view` as a proxy object that is itself always
 * truthy — only reading a *property* off it throws ("[tiptap error]: The
 * editor view is not available…") while the view is unattached. Availability
 * therefore has to be established through a property access, never through
 * the truthiness of `editor.view`.
 */
export function isEditorViewMounted(editor: Editor): boolean {
  try {
    return Boolean(editor.view.dom);
  } catch {
    return false;
  }
}

/**
 * Tracks whether `editor`'s view is mounted, following tiptap's own
 * `mount`/`unmount` lifecycle events with a property-probe for the state at
 * subscription time. Consumers gate any `editor.view` reads on this instead
 * of probing inline, so a pre-mount effect run can never throw through them.
 */
export function useEditorViewMounted(editor: Editor | null): boolean {
  const [viewMounted, setViewMounted] = React.useState(false);

  React.useEffect(() => {
    if (!editor) {
      setViewMounted(false);
      return;
    }
    setViewMounted(isEditorViewMounted(editor));
    const handleMount = () => setViewMounted(true);
    const handleUnmount = () => setViewMounted(false);
    editor.on("mount", handleMount);
    editor.on("unmount", handleUnmount);
    return () => {
      editor.off("mount", handleMount);
      editor.off("unmount", handleUnmount);
    };
  }, [editor]);

  return viewMounted;
}
