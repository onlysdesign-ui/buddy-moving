const PRODUCTION_BACKEND = "https://buddy-moving.onrender.com";

export const getApiBase = () => {
  const envBase =
    (import.meta.env.VITE_BACKEND_URL as string | undefined) ||
    (import.meta.env.VITE_API_BASE as string | undefined);

  if (envBase && envBase.trim()) {
    return envBase;
  }

  if (import.meta.env.DEV) {
    return "http://localhost:3000";
  }

  return PRODUCTION_BACKEND;
};
