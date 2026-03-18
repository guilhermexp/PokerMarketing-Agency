import { AuthWrapper, useAuth } from "./components/auth/AuthWrapper";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { BackgroundJobsProvider } from "./hooks/useBackgroundJobs";
import { authClient } from "./lib/auth-client";
import { MainAppController, type ViewType } from "./main-app-controller";

interface AppProps {
  routeView: ViewType;
}

function AppWithBackgroundJobs({ routeView }: AppProps) {
  const { userId } = useAuth();
  const { data: activeOrg } = authClient.useActiveOrganization();

  return (
    <BackgroundJobsProvider userId={userId} organizationId={activeOrg?.id}>
      <MainAppController routeView={routeView} />
    </BackgroundJobsProvider>
  );
}

export function App({ routeView }: AppProps) {
  return (
    <ErrorBoundary
      fallback={(_error, reset) => (
        <div className="flex items-center justify-center min-h-screen bg-background">
          <div className="text-center space-y-4">
            <h1 className="text-xl font-semibold text-white">
              Algo deu errado
            </h1>
            <p className="text-sm text-muted-foreground">
              Um erro inesperado ocorreu.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={reset}
                className="px-4 py-2 rounded-lg border border-border text-sm text-white hover:bg-white/5 transition-colors"
              >
                Tentar novamente
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Recarregar página
              </button>
            </div>
          </div>
        </div>
      )}
    >
      <AuthWrapper>
        <AppWithBackgroundJobs routeView={routeView} />
      </AuthWrapper>
    </ErrorBoundary>
  );
}
