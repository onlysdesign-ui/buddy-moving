import { NavLink, Route, Routes } from "react-router-dom";
import AnalyzerPage from "./pages/AnalyzerPage";
import TestsPage from "./pages/TestsPage";

const App = () => {
  return (
    <div className="app">
      <header className="app-header">
        <div className="app-brand">
          BuddyMoving{" "}
          <span className="app-version">
            v{__APP_VERSION__} ({__APP_BUILD__})
          </span>
        </div>
        <nav className="app-nav">
          <NavLink to="/" className="nav-link" end>
            Home
          </NavLink>
          <NavLink to="/tests" className="nav-link">
            Tests
          </NavLink>
        </nav>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<AnalyzerPage />} />
          <Route path="/tests" element={<TestsPage />} />
        </Routes>
      </main>
    </div>
  );
};

export default App;
