import api from "./api";

export const getAllTopics = async () => {
  const response = await api.get("/topics");
  return response.data;
};

export const getTopicById = async (id) => {
  const response = await api.get(`/topics/${id}`);
  return response.data;
};

export const createTopic = async (topicData) => {
  const response = await api.post("/topics", topicData);
  return response.data;
};