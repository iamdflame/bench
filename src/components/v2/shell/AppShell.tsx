import AppHeader from "./AppHeader";
import AppFooter from "./AppFooter";

/**
 * Everything consumer-facing renders inside this.
 *
 * It carries `m-app`, which is where the whole light design system is
 * grounded. The verification archive deliberately stays on the older dark
 * sheet: it is a different kind of document and it should look like one.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="m-app">
      <AppHeader />
      <main className="m-main">{children}</main>
      <AppFooter />
    </div>
  );
}
