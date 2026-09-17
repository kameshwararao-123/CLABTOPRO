import api from "./api";

export const submitCode = async (submissionData) => {
  const response = await api.post("/submissions", submissionData);
  return response.data;
};

export const getMySubmissions = async () => {
  const response = await api.get("/submissions/my");
  return response.data;
};

export const getSubmissionById = async (id) => {
  const response = await api.get(`/submissions/${id}`);
  return response.data;
};