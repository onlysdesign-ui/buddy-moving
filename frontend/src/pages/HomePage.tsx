import { Link } from "react-router-dom";

const HomePage = () => {
  return (
    <section className="card">
      <div className="home-header">
        <h1>BuddyMoving</h1>
        <Link className="home-tests-link" to="/tests">
          Tests
        </Link>
      </div>
      <p>
        Welcome to BuddyMoving. Use the Tests page to run regression suites
        against the analysis backend.
      </p>
    </section>
  );
};

export default HomePage;
