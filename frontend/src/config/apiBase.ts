export const getApiBase = (): string => {
  const env = import.meta.env;
  const explicit = env.VITE_BACKEND_URL || env.VITE_API_BASE;
  if (explicit) return explicit;

  if (env.DEV) {
    return "http://localhost:3000";
  }

  return "https://buddy-moving.onrender.com";
};
