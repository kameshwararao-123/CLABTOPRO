import api from "./api";

export const getDraft = async (problemId) => {
  const response = await api.get(`/drafts/${problemId}`);
  return response.data;
};

export const saveDraft = async (problemId, code, language = "c") => {
  const response = await api.put(`/drafts/${problemId}`, {
    code,
    language,
  });
  return response.data;
};

export const deleteDraft = async (problemId) => {
  const response = await api.delete(`/drafts/${problemId}`);
  return response.data;
};
