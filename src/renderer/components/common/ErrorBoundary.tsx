import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ShieldAlert, RefreshCw } from 'lucide-react';
import '../../styles/components/error-boundary.css';

interface ErrorBoundaryProps {
    children: ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    override state: ErrorBoundaryState = {
        hasError: false,
        error: null,
    };

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        console.error('[Fortis] Uncaught renderer error:', error);
        console.error('[Fortis] Component stack:', errorInfo.componentStack);
    }

    handleReload = (): void => {
        window.location.reload();
    };

    override render(): ReactNode {
        if (!this.state.hasError) {
            return this.props.children;
        }

        return (
            <div className="error-boundary">
                <div className="error-boundary__card">
                    <div className="error-boundary__icon">
                        <ShieldAlert size={32} strokeWidth={1.5} />
                    </div>

                    <h1 className="error-boundary__title">
                        Something went wrong
                    </h1>

                    {import.meta.env.DEV && this.state.error && (
                        <div className="error-boundary__message scrollbar-overlay">
                            {this.state.error.message}
                        </div>
                    )}

                    <button
                        className="error-boundary__reload"
                        onClick={this.handleReload}
                        type="button"
                    >
                        <RefreshCw size={16} strokeWidth={1.5} />
                        Reload
                    </button>
                </div>
            </div>
        );
    }
}

export default ErrorBoundary;
