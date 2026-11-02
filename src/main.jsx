import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import "./desk.css";

class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error)
      return (
        <main
          style={{
            padding: 32,
            color: "white",
            background: "#020617",
            minHeight: "100vh",
          }}
        >
          <h1>FINOS-Core could not render</h1>
          <p>{this.state.error.message}</p>
          <button onClick={() => location.reload()}>Reload simulator</button>
        </main>
      );
    return this.props.children;
  }
}
const Legacy = React.lazy(() => import("./LegacySimulator.jsx"));
const simulator =
  new URLSearchParams(location.search).get("mode") === "simulator";
createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    {simulator ? (
      <>
        <div className="scope-notice">
          <strong>ARCHIVED EDUCATIONAL SIMULATOR</strong> — All database,
          broker, concurrency, timing and bank activity shown below are browser
          simulations. State resets on reload. Reference code and performance
          claims are unverified. <a href="/">Open the real ledger →</a>
        </div>
        <React.Suspense fallback={<p>Loading simulator…</p>}>
          <Legacy />
        </React.Suspense>
      </>
    ) : (
      <App />
    )}
  </ErrorBoundary>,
);
