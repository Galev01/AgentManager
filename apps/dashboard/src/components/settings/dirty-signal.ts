"use client";

import { useRef, useCallback } from "react";

export function useDirtySignal() {
  const ref = useRef(false);
  const set = useCallback((value: boolean) => {
    ref.current = value;
  }, []);
  const get = useCallback(() => ref.current, []);
  return { set, get };
}
