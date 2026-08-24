/**
 * Regression guard for the SelectionFormattingTray view-mount probe.
 *
 * tiptap's `editor.view` accessor is a proxy that THROWS
 * ("[tiptap error]: The editor view is not available…") until EditorContent
 * attaches the view. The tray's DOM-wiring effect used to read
 * `editor.view.dom` unguarded, so a channel navigation that ran the effect
 * before the composer view mounted crashed the whole channel route into
 * TanStack Router's error component. The effect now gates on
 * `isEditorViewMounted`, which must classify a throwing accessor as
 * "not mounted" rather than propagating.
 *
 * What is NOT tested here (and why): mounting the tray itself depends on
 * Tiptap and a DOM, neither available in the node:test harness. The mount/
 * unmount event subscription is verified by code review; this pins the pure
 * probe the gate rests on.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { isEditorViewMounted } from "./SelectionFormattingTray.tsx";

test("a pre-mount editor whose view accessor throws reads as not mounted", () => {
  const unmountedEditor = {
    get view() {
      throw new Error(
        "[tiptap error]: The editor view is not available. Cannot access view['dom']. The editor may not be mounted yet.",
      );
    },
  };
  assert.equal(isEditorViewMounted(unmountedEditor), false);
});

test("a mounted editor with an attached view reads as mounted", () => {
  const mountedEditor = { view: { dom: {} } };
  assert.equal(isEditorViewMounted(mountedEditor), true);
});
