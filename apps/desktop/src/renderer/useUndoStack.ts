import { useCallback, useRef } from "react";

/** Lightweight undo/redo stack for controlled fields (React resets native undo). */
export function useUndoStack<T>(getCurrent: () => T, limit = 80) {
  const undoRef = useRef<T[]>([]);
  const redoRef = useRef<T[]>([]);
  const applyingRef = useRef(false);

  const clear = useCallback(() => {
    undoRef.current = [];
    redoRef.current = [];
  }, []);

  const push = useCallback(
    (snapshot?: T) => {
      if (applyingRef.current) return;
      undoRef.current.push(snapshot ?? getCurrent());
      if (undoRef.current.length > limit) undoRef.current.shift();
      redoRef.current = [];
    },
    [getCurrent, limit],
  );

  const undo = useCallback((): T | null => {
    const prev = undoRef.current.pop();
    if (prev === undefined) return null;
    redoRef.current.push(getCurrent());
    applyingRef.current = true;
    return prev;
  }, [getCurrent]);

  const redo = useCallback((): T | null => {
    const next = redoRef.current.pop();
    if (next === undefined) return null;
    undoRef.current.push(getCurrent());
    applyingRef.current = true;
    return next;
  }, [getCurrent]);

  const finishApply = useCallback(() => {
    applyingRef.current = false;
  }, []);

  return { push, undo, redo, clear, finishApply };
}
