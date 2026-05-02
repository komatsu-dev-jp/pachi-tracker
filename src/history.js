import { useState, useCallback } from "react";

const CAPACITY = 20;

const trim = (arr) => (arr.length > CAPACITY ? arr.slice(arr.length - CAPACITY) : arr);

export function useUndoStack(getSnapshot, applySnapshot) {
    const [undoStack, setUndoStack] = useState([]);
    const [redoStack, setRedoStack] = useState([]);

    const pushSnapshot = useCallback(() => {
        const snap = getSnapshot();
        setUndoStack((prev) => {
            const last = prev[prev.length - 1];
            if (last && JSON.stringify(last) === JSON.stringify(snap)) return prev;
            return trim([...prev, snap]);
        });
        setRedoStack([]);
    }, [getSnapshot]);

    const undo = useCallback(() => {
        if (undoStack.length === 0) return;
        const current = getSnapshot();
        const target = undoStack[undoStack.length - 1];
        setUndoStack((prev) => prev.slice(0, -1));
        setRedoStack((prev) => trim([...prev, current]));
        applySnapshot(target);
    }, [undoStack, getSnapshot, applySnapshot]);

    const redo = useCallback(() => {
        if (redoStack.length === 0) return;
        const current = getSnapshot();
        const target = redoStack[redoStack.length - 1];
        setRedoStack((prev) => prev.slice(0, -1));
        setUndoStack((prev) => trim([...prev, current]));
        applySnapshot(target);
    }, [redoStack, getSnapshot, applySnapshot]);

    return {
        pushSnapshot,
        undo,
        redo,
        canUndo: undoStack.length > 0,
        canRedo: redoStack.length > 0,
    };
}
