export const getApiBase = () => {
  const envBase =
    import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_BASE;
  const trimmedBase = envBase ? String(envBase).trim() : "";
  const lowerBase = trimmedBase.toLowerCase();
  const isAbsoluteUrl = /^https?:\/\//i.test(trimmedBase);
  const isGithubPages =
    typeof window !== "undefined" &&
    window.location.hostname.endsWith("github.io");
  const normalizeBase = (value: string) => value.replace(/\/+$/, "");

  if (trimmedBase && lowerBase !== "undefined" && lowerBase !== "null") {
    if (isAbsoluteUrl) {
      return normalizeBase(trimmedBase);
    }
    if (!isGithubPages && typeof window !== "undefined") {
      return normalizeBase(new URL(trimmedBase, window.location.origin).toString());
    }
  }
  if (import.meta.env.DEV) {
    return "http://localhost:3000";
  }
  return "https://buddy-moving.onrender.com";
};
