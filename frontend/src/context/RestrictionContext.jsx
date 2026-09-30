import React, { createContext, useContext, useState, useEffect, useRef } from "react";

const RestrictionContext = createContext(null);

export const RestrictionProvider = ({ children }) => {
  const [switchCount, setSwitchCount] = useState(() => {
    try {
      const saved = sessionStorage.getItem("clab_tab_switches");
      return saved ? parseInt(saved, 10) : 0;
    } catch {
      return 0;
    }
  });

  const [showWarningModal, setShowWarningModal] = useState(false);
  const [lastViolationType, setLastViolationType] = useState("");
  const [lastViolationTime, setLastViolationTime] = useState(null);

  const lastTriggerTimeRef = useRef(0);

  const triggerViolation = (type) => {
    const now = Date.now();
    // Debounce multiple rapid events (e.g. visibilitychange + blur within 800ms)
    if (now - lastTriggerTimeRef.current < 800) {
      return;
    }
    lastTriggerTimeRef.current = now;

    setSwitchCount((prev) => {
      const next = prev + 1;
      try {
        sessionStorage.setItem("clab_tab_switches", next.toString());
      } catch {
        // Silently ignore storage errors
      }
      return next;
    });

    setLastViolationType(type);
    setLastViolationTime(
      new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    );
    setShowWarningModal(true);
  };

  useEffect(() => {
    // 1. Detect Browser Tab Switch or Window Minimize
    const handleVisibilityChange = () => {
      if (document.hidden) {
        triggerViolation("Browser Tab Switched or Window Minimized");
      }
    };

    // 2. Detect Application Switch (Alt+Tab, background apps, clicking another window/screen)
    const handleWindowBlur = () => {
      triggerViolation("Application Switched (Window Lost Focus)");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, []);

  const acknowledgeWarning = () => {
    setShowWarningModal(false);
    try {
      window.focus();
    } catch {
      // Ignore focus errors
    }
  };

  const resetSwitchCount = () => {
    setSwitchCount(0);
    try {
      sessionStorage.removeItem("clab_tab_switches");
    } catch {
      // Ignore
    }
  };

  return (
    <RestrictionContext.Provider
      value={{
        switchCount,
        showWarningModal,
        lastViolationType,
        lastViolationTime,
        acknowledgeWarning,
        resetSwitchCount,
      }}
    >
      {children}
    </RestrictionContext.Provider>
  );
};

export const useRestriction = () => {
  const context = useContext(RestrictionContext);
  if (!context) {
    return {
      switchCount: 0,
      showWarningModal: false,
      lastViolationType: "",
      lastViolationTime: null,
      acknowledgeWarning: () => {},
      resetSwitchCount: () => {},
    };
  }
  return context;
};
