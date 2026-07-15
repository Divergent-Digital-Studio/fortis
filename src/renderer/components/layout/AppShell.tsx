import type { ReactNode } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import type { StatusMode } from './Header';
import '../../styles/components/app-shell.css';

interface AppShellProps {
    statusMode?: StatusMode;
    onScanNow?: () => void;
    onUpgrade?: () => void;
    children: ReactNode;
}

function AppShell({ statusMode, onScanNow, onUpgrade, children }: AppShellProps) {
    return (
        <div className="app-shell">
            <Sidebar />
            <div className="app-shell__main">
                <Header
                    statusMode={statusMode}
                    onScanNow={onScanNow}
                    onUpgrade={onUpgrade}
                />
                <main className="app-shell__content scrollbar-overlay">
                    <div className="app-shell__content-inner">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}

export default AppShell;
export type { AppShellProps };
