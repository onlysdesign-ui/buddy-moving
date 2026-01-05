import { useCallback, useEffect, useMemo, useState } from "react";
import { TestsPage } from "./pages/TestsPage";

const getBasePath = () => {
  const base = import.meta.env.BASE_URL || "/";
  return base.endsWith("/") ? base.slice(0, -1) : base;
};

const resolveRoute = () => {
  const base = getBasePath();
  const path = window.location.pathname;
  if (base && path.startsWith(base)) {
    const next = path.slice(base.length);
    return next || "/";
  }
  return path || "/";
};

export const App = () => {
  const [route, setRoute] = useState(resolveRoute());
  const base = useMemo(() => getBasePath(), []);

  const navigate = useCallback(
    (next: string) => {
      const target = next === "/" ? `${base}/` : `${base}${next}`;
      window.history.pushState({}, "", target.replace(/\/{2,}/g, "/"));
      setRoute(next);
    },
    [base],
  );

  useEffect(() => {
    const handler = () => setRoute(resolveRoute());
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  return (
    <div className="app-shell">
      <header>
        <nav>
          <button
            type="button"
            onClick={() => navigate("/")}
            aria-current={route === "/" ? "page" : undefined}
          >
            Home
          </button>
          <button
            type="button"
            onClick={() => navigate("/tests")}
            aria-current={route === "/tests" ? "page" : undefined}
          >
            Tests
          </button>
        </nav>
      </header>
      <main>{route === "/tests" ? <TestsPage /> : <div>Home</div>}</main>
    </div>
  );
};
