import api from "./api";

export const getMyProgress = async () => {
  const response = await api.get("/progress");
  return response.data;
};

export const getMyStreak = async () => {
  const response = await api.get("/progress/streak");
  return response.data;
};