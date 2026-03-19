import { api, saveToken, clearToken } from "./client";

export interface LoginResponse {
  access_token: string;
  user_id: string;
  user_name: string;
  company_id: string;
  role: string;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const data = await api.post<LoginResponse>("/api/auth/login", { email, password });
  saveToken(data.access_token);
  return data;
}

export function logout() {
  clearToken();
}
