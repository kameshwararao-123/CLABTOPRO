import api from "./api";

const CACHE_TTL_MS = 30000;
const responseCache = new Map();
const inFlightRequests = new Map();

const cachedGet = async (key, fetcher, { forceRefresh = false } = {}) => {
  if (!forceRefresh) {
    const cached = responseCache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }

    if (inFlightRequests.has(key)) {
      return inFlightRequests.get(key);
    }
  }

  const requestPromise = fetcher()
    .then((data) => {
      responseCache.set(key, { data, timestamp: Date.now() });
      return data;
    })
    .finally(() => {
      inFlightRequests.delete(key);
    });

  inFlightRequests.set(key, requestPromise);
  return requestPromise;
};

export const invalidateProblemCache = (problemId = null) => {
  responseCache.delete("problems:all");
  responseCache.delete("problems:today");
  if (problemId) {
    responseCache.delete(`problems:id:${problemId}`);
  } else {
    for (const key of responseCache.keys()) {
      if (key.startsWith("problems:id:")) {
        responseCache.delete(key);
      }
    }
  }
};

export const getTodayProblem = async (options) => {
  return cachedGet(
    "problems:today",
    async () => {
      const response = await api.get("/problems/today");
      return response.data;
    },
    options
  );
};

export const getAllProblems = async (options) => {
  return cachedGet(
    "problems:all",
    async () => {
      const response = await api.get("/problems");
      return response.data;
    },
    options
  );
};

export const getProblemById = async (id, options) => {
  return cachedGet(
    `problems:id:${id}`,
    async () => {
      const response = await api.get(`/problems/${id}`);
      return response.data;
    },
    options
  );
};

export const createProblem = async (problemData) => {
  const response = await api.post("/problems", problemData);
  invalidateProblemCache();
  return response.data;
};

export const updateProblem = async (id, problemData) => {
  const response = await api.put(`/problems/${id}`, problemData);
  invalidateProblemCache(id);
  return response.data;
};

export const deleteProblem = async (id) => {
  const response = await api.delete(`/problems/${id}`);
  invalidateProblemCache(id);
  return response.data;
};
