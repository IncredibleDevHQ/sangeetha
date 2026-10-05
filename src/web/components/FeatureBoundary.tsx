import { Component, Suspense, type ReactNode } from "react";

class ScreenError extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <div className="ui-empty" role="alert">
          <h2>We couldn’t open this screen</h2>
          <p>
            Reload to try again, or choose another area from the navigation.
          </p>
          <button
            className="button secondary"
            onClick={() => window.location.reload()}
          >
            Reload screen
          </button>
        </div>
      );
    return this.props.children;
  }
}

/** Keep the shell usable while a feature downloads or fails to render. */
export function FeatureBoundary({
  children,
  label = "Opening workspace…",
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <ScreenError>
      <Suspense
        fallback={
          <p className="ui-empty" role="status">
            {label}
          </p>
        }
      >
        {children}
      </Suspense>
    </ScreenError>
  );
}
