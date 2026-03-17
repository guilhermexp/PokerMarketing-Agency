import { AuthWrapper, useAuth } from "./components/auth/AuthWrapper";
import { BackgroundJobsProvider } from "./hooks/useBackgroundJobs";
import { authClient } from "./lib/auth-client";
import { MainAppController } from "./main-app-controller";

function AppWithBackgroundJobs() {
  const { userId } = useAuth();
  const { data: activeOrg } = authClient.useActiveOrganization();

  return (
    <BackgroundJobsProvider userId={userId} organizationId={activeOrg?.id}>
      <MainAppController />
    </BackgroundJobsProvider>
  );
}

export function App() {
  return (
    <AuthWrapper>
      <AppWithBackgroundJobs />
    </AuthWrapper>
  );
}
