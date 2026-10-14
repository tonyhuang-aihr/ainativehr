export type HistoryAction = {
  id: string;
  label: string;
  source: "user" | "ai";
  at: string;
};

export type UndoState<T> = {
  past: { state: T; action: HistoryAction }[];
  present: T;
  future: { state: T; action: HistoryAction }[];
};

export function createUndo<T>(present: T): UndoState<T> {
  return { past: [], present, future: [] };
}

export function commitUndo<T>(
  state: UndoState<T>,
  next: T,
  action: HistoryAction,
  limit = 40,
): UndoState<T> {
  const past = [...state.past, { state: state.present, action }];
  return {
    past: past.length > limit ? past.slice(past.length - limit) : past,
    present: next,
    future: [],
  };
}

export function undo<T>(state: UndoState<T>): UndoState<T> {
  if (state.past.length === 0) return state;
  const previous = state.past[state.past.length - 1];
  return {
    past: state.past.slice(0, -1),
    present: previous.state,
    future: [{ state: state.present, action: previous.action }, ...state.future],
  };
}

export function redo<T>(state: UndoState<T>): UndoState<T> {
  if (state.future.length === 0) return state;
  const next = state.future[0];
  return {
    past: [...state.past, { state: state.present, action: next.action }],
    present: next.state,
    future: state.future.slice(1),
  };
}
