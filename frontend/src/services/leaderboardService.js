import api from "./api";

export const getLeaderboard = async (limit = 50) => {
  const response = await api.get("/leaderboard", {
    params: { limit },
  });
  return response.data;
};
