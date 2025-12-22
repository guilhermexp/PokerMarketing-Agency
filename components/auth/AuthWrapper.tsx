import { useEffect, useState, createContext, useContext } from 'react';
import {
  SignedIn,
  SignedOut,
  SignIn,
  UserButton,
  useUser,
} from '@clerk/clerk-react';
import { getOrCreateUser, type DbUser } from '../../services/apiClient';
import { OrganizationProvider } from '../../contexts/OrganizationContext';

interface AuthContextType {
  dbUser: DbUser | null;
  isLoading: boolean;
  userId: string | null;
  clerkUserId: string | null;
}

const AuthContext = createContext<AuthContextType>({
  dbUser: null,
  isLoading: true,
  userId: null,
  clerkUserId: null,
});

export function useAuth() {
  return useContext(AuthContext);
}

interface AuthWrapperProps {
  children: React.ReactNode;
}

export function AuthWrapper({ children }: AuthWrapperProps) {
  const { user, isLoaded: clerkLoaded, isSignedIn } = useUser();
  const [dbUser, setDbUser] = useState<DbUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function syncUser() {
      if (!clerkLoaded) return;

      if (!isSignedIn || !user) {
        setDbUser(null);
        setIsLoading(false);
        return;
      }

      try {
        const email = user.primaryEmailAddress?.emailAddress;
        const name = user.fullName || user.firstName || 'User';

        if (!email) {
          console.error('User has no email address');
          setIsLoading(false);
          return;
        }

        const syncedUser = await getOrCreateUser({
          email,
          name,
          avatar_url: user.imageUrl,
          auth_provider: 'clerk',
          auth_provider_id: user.id,
        });

        setDbUser(syncedUser);
      } catch (error) {
        console.error('Failed to sync user with database:', error);
        // Still allow access even if DB sync fails (for development)
        setDbUser({
          id: user.id,
          email: user.primaryEmailAddress?.emailAddress || '',
          name: user.fullName || user.firstName || 'User',
          avatar_url: user.imageUrl || null,
          created_at: new Date().toISOString(),
        });
      } finally {
        setIsLoading(false);
      }
    }

    syncUser();
  }, [clerkLoaded, isSignedIn, user]);

  const contextValue: AuthContextType = {
    dbUser,
    isLoading: !clerkLoaded || isLoading,
    userId: dbUser?.id || null,
    clerkUserId: user?.id || null,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      <SignedOut>
        <div className="min-h-screen flex items-center justify-center bg-black">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-white mb-2">DirectorAi</h1>
            <p className="text-white/40 mb-8">Poker Marketing Agency</p>
            <SignIn
              appearance={{
                elements: {
                  rootBox: 'mx-auto',
                  card: 'bg-[#0a0a0a] border border-white/10',
                  headerTitle: 'text-white',
                  headerSubtitle: 'text-white/50',
                  socialButtonsBlockButton: 'bg-white/5 border-white/10 text-white hover:bg-white/10',
                  formFieldLabel: 'text-white/70',
                  formFieldInput: 'bg-white/5 border-white/10 text-white',
                  footerActionLink: 'text-amber-500 hover:text-amber-400',
                  identityPreviewText: 'text-white',
                  identityPreviewEditButton: 'text-amber-500',
                  formButtonPrimary: 'bg-white text-black hover:bg-white/90',
                }
              }}
            />
          </div>
        </div>
      </SignedOut>
      <SignedIn>
        <OrganizationProvider>
          {children}
        </OrganizationProvider>
      </SignedIn>
    </AuthContext.Provider>
  );
}

export function UserProfileButton() {
  return (
    <UserButton
      afterSignOutUrl="/"
      appearance={{
        elements: {
          avatarBox: 'w-8 h-8',
        }
      }}
    />
  );
}

export function useCurrentUser() {
  const { user, isLoaded, isSignedIn } = useUser();
  const { dbUser, userId } = useAuth();

  return {
    user,
    dbUser,
    isLoaded,
    isSignedIn,
    userId,
    clerkUserId: user?.id,
    email: user?.primaryEmailAddress?.emailAddress,
    name: user?.fullName || user?.firstName || 'User',
    avatarUrl: user?.imageUrl,
  };
}
