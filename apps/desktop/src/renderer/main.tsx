import { Component, StrictMode, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/geist";
import App from "./App";
import "./styles.css";

class BootErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Intray render crashed", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: 24,
            fontFamily: "Segoe UI, sans-serif",
            color: "#e8e8ea",
            background: "#141416",
            minHeight: "100vh",
            whiteSpace: "pre-wrap",
          }}
        >
          <h1 style={{ fontSize: 18, margin: "0 0 12px" }}>Intray hit a render error</h1>
          <p style={{ opacity: 0.8, margin: "0 0 16px" }}>
            {this.state.error.message}
          </p>
          <pre style={{ fontSize: 12, opacity: 0.65, overflow: "auto" }}>
            {this.state.error.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BootErrorBoundary>
      <App />
    </BootErrorBoundary>
  </StrictMode>,
);
