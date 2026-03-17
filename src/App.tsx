import { AuthWrapper, useAuth } from "./components/auth/AuthWrapper";
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
    <AuthWrapper>
      <AppWithBackgroundJobs routeView={routeView} />
    </AuthWrapper>
  );
}
