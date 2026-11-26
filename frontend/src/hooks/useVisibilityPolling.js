import { useEffect, useRef } from "react";

/**
 * Visibility-aware polling hook with in-flight request deduplication.
 * - Pauses polling when the browser tab is hidden.
 * - Triggers an immediate refresh when returning to the tab.
 * - Skips overlapping ticks if the previous request is still in flight.
 */
const useVisibilityPolling = (callback, intervalMs, enabled = true) => {
  const callbackRef = useRef(callback);
  const inFlightRef = useRef(false);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled || !intervalMs || intervalMs <= 0) return;

    let cancelled = false;

    const runPoll = async () => {
      if (cancelled || inFlightRef.current) return;
      if (typeof document !== "undefined" && document.hidden) return;

      inFlightRef.current = true;
      try {
        await callbackRef.current?.();
      } catch {
        // Errors are handled inside the caller
      } finally {
        inFlightRef.current = false;
      }
    };

    const intervalId = setInterval(runPoll, intervalMs);

    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && !document.hidden) {
        runPoll();
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };
  }, [intervalMs, enabled]);
};

export default useVisibilityPolling;
