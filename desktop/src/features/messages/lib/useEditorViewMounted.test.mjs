/**
 * Proxy-faithful lifecycle tests for useEditorViewMounted (PR #6731 P1).
 *
 * tiptap's real pre-mount `editor.view` is a truthy Proxy whose *property*
 * reads throw — `Boolean(editor.view)` is true even while `editor.view.dom`
 * throws "The editor view is not available". The fake editor below models
 * exactly that shape (plus tiptap's `mount`/`unmount` events), so a probe
 * that only checks the view's truthiness fails these tests: the original
 * regression shipped exactly that probe and re-crashed the channel route.
 *
 * Covered: pre-mount state, mount, unmount, remount, stale events from a
 * replaced editor, and listener cleanup on hook unmount.
 */

import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
});

before(() => {
  Object.assign(globalThis, {
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
    window: dom.window,
  });
});

after(() => dom.window.close());

/** Mirrors tiptap: truthy view proxy pre-mount, property reads throw. */
function createFakeEditor() {
  let mounted = false;
  const listeners = new Map();
  const throwingView = new Proxy(
    {},
    {
      get(_target, key) {
        throw new Error(
          `[tiptap error]: The editor view is not available. Cannot access view['${String(key)}']. The editor may not be mounted yet.`,
        );
      },
    },
  );
  const attachedView = { dom: dom.window.document.createElement("div") };
  return {
    get view() {
      return mounted ? attachedView : throwingView;
    },
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(handler);
    },
    off(event, handler) {
      listeners.get(event)?.delete(handler);
    },
    emit(event) {
      for (const handler of listeners.get(event) ?? []) handler();
    },
    listenerCount(event) {
      return listeners.get(event)?.size ?? 0;
    },
    mountView() {
      mounted = true;
      this.emit("mount");
    },
    unmountView() {
      mounted = false;
      this.emit("unmount");
    },
  };
}

test("a truthiness probe misreads the pre-mount proxy; the property probe does not", async () => {
  const { isEditorViewMounted } = await import("./useEditorViewMounted.ts");
  const editor = createFakeEditor();

  // The trap the original fix fell into: the proxy itself is truthy…
  assert.equal(Boolean(editor.view), true);
  // …and only a property read reveals the unattached view.
  assert.throws(() => editor.view.dom, /editor view is not available/);

  assert.equal(isEditorViewMounted(editor), false);
  editor.mountView();
  assert.equal(isEditorViewMounted(editor), true);
});

test("tracks mount, unmount, and remount through the editor lifecycle", async () => {
  const { act, renderHook } = await import("@testing-library/react");
  const { useEditorViewMounted } = await import("./useEditorViewMounted.ts");
  const editor = createFakeEditor();

  const { result, unmount } = renderHook(() => useEditorViewMounted(editor));
  assert.equal(result.current, false, "pre-mount view reads as unavailable");

  act(() => editor.mountView());
  assert.equal(result.current, true, "mount event flips availability on");

  act(() => editor.unmountView());
  assert.equal(result.current, false, "unmount event flips availability off");

  act(() => editor.mountView());
  assert.equal(result.current, true, "remount is tracked, not one-shot");

  unmount();
});

test("an already-mounted editor reads as available at subscription time", async () => {
  const { renderHook } = await import("@testing-library/react");
  const { useEditorViewMounted } = await import("./useEditorViewMounted.ts");
  const editor = createFakeEditor();
  editor.mountView();

  const { result, unmount } = renderHook(() => useEditorViewMounted(editor));
  assert.equal(result.current, true);
  unmount();
});

test("stale events from a replaced editor cannot corrupt the new editor's state", async () => {
  const { act, renderHook } = await import("@testing-library/react");
  const { useEditorViewMounted } = await import("./useEditorViewMounted.ts");
  const first = createFakeEditor();
  const second = createFakeEditor();
  second.mountView();

  // The editor travels through a closure rather than renderHook props:
  // React 19's dev-only props differ walks prop objects property-by-property
  // on rerender, which would trip the fake's (tiptap-faithful) throwing view.
  let currentEditor = first;
  const { rerender, result, unmount } = renderHook(() =>
    useEditorViewMounted(currentEditor),
  );
  assert.equal(result.current, false);

  currentEditor = second;
  rerender();
  assert.equal(result.current, true, "swapped-in mounted editor reads true");
  assert.equal(
    first.listenerCount("mount") + first.listenerCount("unmount"),
    0,
    "listeners on the replaced editor are removed",
  );

  // A stale unmount from the old editor must not flip the new editor's state.
  act(() => first.unmountView());
  assert.equal(result.current, true);
  unmount();
});

test("hook unmount removes both lifecycle listeners", async () => {
  const { renderHook } = await import("@testing-library/react");
  const { useEditorViewMounted } = await import("./useEditorViewMounted.ts");
  const editor = createFakeEditor();

  const { unmount } = renderHook(() => useEditorViewMounted(editor));
  assert.equal(editor.listenerCount("mount"), 1);
  assert.equal(editor.listenerCount("unmount"), 1);

  unmount();
  assert.equal(editor.listenerCount("mount"), 0);
  assert.equal(editor.listenerCount("unmount"), 0);
});

test("a null editor reads as unavailable", async () => {
  const { renderHook } = await import("@testing-library/react");
  const { useEditorViewMounted } = await import("./useEditorViewMounted.ts");
  const { result, unmount } = renderHook(() => useEditorViewMounted(null));
  assert.equal(result.current, false);
  unmount();
});
