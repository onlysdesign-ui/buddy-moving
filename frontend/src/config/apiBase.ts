export const getApiBase = () => {
  const envBase =
    import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_BASE;
  if (envBase && String(envBase).trim()) {
    return String(envBase).trim();
  }
  if (import.meta.env.DEV) {
    return "http://localhost:3000";
  }
  return "https://buddy-moving.onrender.com";
};
