import { useState, useEffect, useRef, useCallback } from "react";
import { getDraft, saveDraft, deleteDraft } from "../services/draftService";

const LOCAL_KEY_PREFIX = "clab_draft";

const getLocalStorageKey = (userId, problemId) => {
  if (!userId || !problemId) return null;
  return `${LOCAL_KEY_PREFIX}_${userId}_${problemId}`;
};

const readLocalBackup = (key) => {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.code === "string") {
      return parsed;
    }
  } catch {
    // Ignore storage corruption
  }
  return null;
};

const writeLocalBackup = (key, code, pendingSync = true) => {
  if (!key || typeof code !== "string" || !code.trim()) return;
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        code,
        updatedAt: Date.now(),
        pendingSync,
      })
    );
  } catch {
    // Ignore quota errors
  }
};

const removeLocalBackup = (key) => {
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage errors
  }
};

/**
 * Manages automatic debounced code draft persistence to the backend API
 * with localStorage offline backup and automatic sync recovery.
 */
export const useCodeDraft = ({ problemId, userId, defaultCode }) => {
  const [code, setCodeState] = useState(defaultCode);
  const [saveStatus, setSaveStatus] = useState("idle"); // "idle" | "saving" | "saved" | "failed"
  const [hasPendingOfflineSync, setHasPendingOfflineSync] = useState(false);

  const storageKey = getLocalStorageKey(userId, problemId);

  const codeRef = useRef(defaultCode);
  const lastSavedCodeRef = useRef("");
  const isDirtyRef = useRef(false);
  const debounceTimerRef = useRef(null);
  const isMountedRef = useRef(true);
  const activeProblemRef = useRef(problemId);

  useEffect(() => {
    isMountedRef.current = true;
    activeProblemRef.current = problemId;
    return () => {
      isMountedRef.current = false;
    };
  }, [problemId]);

  const persistToServer = useCallback(
    async (targetProblemId, codeToSave, keyForProblem) => {
      if (!targetProblemId || typeof codeToSave !== "string" || !codeToSave.trim()) {
        return false;
      }

      if (isMountedRef.current && activeProblemRef.current === targetProblemId) {
        setSaveStatus("saving");
      }

      try {
        await saveDraft(targetProblemId, codeToSave, "c");
        lastSavedCodeRef.current = codeToSave;
        isDirtyRef.current = false;
        writeLocalBackup(keyForProblem, codeToSave, false);

        if (isMountedRef.current && activeProblemRef.current === targetProblemId) {
          setSaveStatus("saved");
          setHasPendingOfflineSync(false);
        }
        return true;
      } catch {
        // Preserve locally so connectivity loss never drops code
        writeLocalBackup(keyForProblem, codeToSave, true);
        if (isMountedRef.current && activeProblemRef.current === targetProblemId) {
          setSaveStatus("failed");
          setHasPendingOfflineSync(true);
        }
        return false;
      }
    },
    []
  );

  /**
   * Resolves the initial editor content using:
   * 1. Newer unsynced local backup (if offline edits occurred)
   * 2. Server-saved draft
   * 3. Any local backup
   * 4. Previous submission fallback
   * 5. Starter boilerplate
   */
  const initializeDraft = useCallback(
    async ({ fallbackCode = defaultCode } = {}) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      lastSavedCodeRef.current = "";
      isDirtyRef.current = false;

      const key = getLocalStorageKey(userId, problemId);
      const localBackup = readLocalBackup(key);

      let serverDraft = null;
      try {
        const res = await getDraft(problemId);
        serverDraft = res?.draft || null;
      } catch {
        // Offline or transient error: fall back cleanly to local backup
      }

      let resolved = fallbackCode;
      let nextStatus = "idle";
      let needsSync = false;

      const serverTime = serverDraft?.updatedAt
        ? new Date(serverDraft.updatedAt).getTime()
        : 0;

      if (
        localBackup?.pendingSync &&
        localBackup.code?.trim() &&
        (!serverDraft?.code || (localBackup.updatedAt || 0) >= serverTime)
      ) {
        resolved = localBackup.code;
        needsSync = true;
        nextStatus = "saving";
      } else if (serverDraft?.code && serverDraft.code.trim()) {
        resolved = serverDraft.code;
        lastSavedCodeRef.current = serverDraft.code;
        writeLocalBackup(key, serverDraft.code, false);
        nextStatus = "saved";
      } else if (localBackup?.code && localBackup.code.trim()) {
        resolved = localBackup.code;
        needsSync = Boolean(localBackup.pendingSync);
        nextStatus = localBackup.pendingSync ? "saving" : "saved";
      }

      codeRef.current = resolved;
      if (isMountedRef.current && activeProblemRef.current === problemId) {
        setCodeState(resolved);
        setSaveStatus(nextStatus);
        setHasPendingOfflineSync(needsSync);
      }

      if (needsSync && resolved.trim()) {
        await persistToServer(problemId, resolved, key);
      }

      return resolved;
    },
    [problemId, userId, defaultCode, persistToServer]
  );

  /**
   * Updates editor code and schedules debounced draft save (750ms).
   * Never overwrites an existing draft with empty code.
   */
  const updateCode = useCallback(
    (nextCode) => {
      const value = typeof nextCode === "string" ? nextCode : "";
      codeRef.current = value;
      isDirtyRef.current = true;
      setCodeState(value);

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      // Guard: avoid saving empty code over an existing draft
      if (!value.trim()) {
        return;
      }

      writeLocalBackup(storageKey, value, true);
      setSaveStatus("saving");
      setHasPendingOfflineSync(true);

      const targetId = problemId;
      const key = storageKey;
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        persistToServer(targetId, value, key);
      }, 750);
    },
    [problemId, storageKey, persistToServer]
  );

  /**
   * Immediately flushes any pending draft changes (Ctrl+S, onBlur, unmount).
   */
  const flushDraft = useCallback(async () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const current = codeRef.current;
    if (!current || !current.trim()) return false;
    if (!isDirtyRef.current && current === lastSavedCodeRef.current && saveStatus === "saved") {
      return true;
    }

    return persistToServer(problemId, current, storageKey);
  }, [problemId, storageKey, saveStatus, persistToServer]);

  /**
   * Clears both backend draft and local backup after explicit reset confirmation.
   */
  const clearDraft = useCallback(
    async (resetToCode = defaultCode) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      lastSavedCodeRef.current = "";
      isDirtyRef.current = false;

      codeRef.current = resetToCode;
      setCodeState(resetToCode);
      setSaveStatus("idle");
      setHasPendingOfflineSync(false);
      removeLocalBackup(storageKey);

      try {
        await deleteDraft(problemId);
      } catch {
        // Non-fatal if offline or no draft existed
      }
    },
    [problemId, storageKey, defaultCode]
  );

  // Sync automatically when connectivity returns
  useEffect(() => {
    const handleOnline = () => {
      const backup = readLocalBackup(storageKey);
      if (backup?.pendingSync && backup.code?.trim()) {
        persistToServer(problemId, backup.code, storageKey);
      }
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [problemId, storageKey, persistToServer]);

  // Flush unsaved draft on page unload / route switch
  useEffect(() => {
    const handleBeforeUnload = () => {
      const current = codeRef.current;
      if (isDirtyRef.current && current && current.trim() && current !== lastSavedCodeRef.current) {
        writeLocalBackup(storageKey, current, true);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      const current = codeRef.current;
      if (isDirtyRef.current && current && current.trim() && current !== lastSavedCodeRef.current) {
        writeLocalBackup(storageKey, current, true);
        // Fire-and-forget flush when navigating between problems
        saveDraft(problemId, current, "c").catch(() => {});
      }
    };
  }, [problemId, storageKey]);

  return {
    code,
    codeRef,
    saveStatus,
    hasPendingOfflineSync,
    initializeDraft,
    updateCode,
    flushDraft,
    clearDraft,
  };
};
