import React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import Button from "./Button.jsx";

export class RegionErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("Region error boundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="rounded-[var(--radius-lg)] border border-[var(--bad-border)] bg-[var(--bad-bg)] p-6 space-y-3"
        >
          <div className="flex items-center gap-2 text-sm font-bold text-[var(--bad)]">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{this.props.title || "This workspace section encountered an unexpected error"}</span>
          </div>
          <p className="m-0 text-xs text-[var(--text-secondary)]">
            {this.state.error?.message || "An unexpected rendering error occurred."}
          </p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Retry Section
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default RegionErrorBoundary;
