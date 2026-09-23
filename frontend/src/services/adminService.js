import api from "./api";

export const getAdminDashboard = async () => {
  const response = await api.get("/admin/dashboard");
  return response.data;
};

export const getAllStudents = async () => {
  const response = await api.get("/admin/students");
  return response.data;
};

