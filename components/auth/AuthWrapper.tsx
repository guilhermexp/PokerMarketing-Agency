import { useEffect, useState, createContext, useContext, useRef } from "react";
import {
  SignedIn,
  SignedOut,
  SignIn,
  UserButton,
  useUser,
} from "@clerk/clerk-react";
import { getOrCreateUser, type DbUser } from "../../services/apiClient";

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

  // Track if we've already synced this user to prevent duplicate calls
  const syncedUserIdRef = useRef<string | null>(null);

  // Extract primitive values to use as dependencies (prevents re-renders)
  const clerkUserId = user?.id;
  const userEmail = user?.primaryEmailAddress?.emailAddress;
  const userName = user?.fullName || user?.firstName || "User";
  const userImage = user?.imageUrl;

  useEffect(() => {
    async function syncUser() {
      if (!clerkLoaded) return;

      if (!isSignedIn || !clerkUserId) {
        setDbUser(null);
        setIsLoading(false);
        syncedUserIdRef.current = null;
        return;
      }

      // Skip if we've already synced this user
      if (syncedUserIdRef.current === clerkUserId) {
        return;
      }

      try {
        if (!userEmail) {
          console.error("User has no email address");
          setIsLoading(false);
          return;
        }

        console.log("[Auth] Syncing user to database (once per session)...");
        const syncedUser = await getOrCreateUser({
          email: userEmail,
          name: userName,
          avatar_url: userImage,
          auth_provider: "clerk",
          auth_provider_id: clerkUserId,
        });

        setDbUser(syncedUser);
        syncedUserIdRef.current = clerkUserId; // Mark as synced
        console.log("[Auth] User synced successfully:", syncedUser.id);
      } catch (error) {
        console.error("Failed to sync user with database:", error);
        // Still allow access even if DB sync fails (for development)
        setDbUser({
          id: clerkUserId,
          email: userEmail || "",
          name: userName,
          avatar_url: userImage || null,
          created_at: new Date().toISOString(),
        });
        syncedUserIdRef.current = clerkUserId; // Still mark as synced to prevent retries
      } finally {
        setIsLoading(false);
      }
    }

    syncUser();
  }, [clerkLoaded, isSignedIn, clerkUserId, userEmail, userName, userImage]);

  const contextValue: AuthContextType = {
    dbUser,
    isLoading: !clerkLoaded || isLoading,
    userId: dbUser?.id || null,
    clerkUserId: user?.id || null,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      <SignedOut>
        <div className="min-h-screen flex items-center justify-center bg-black relative overflow-hidden">
          {/* Scattered logos */}
          <img src="/logo-socialab.png" alt="" className="absolute top-[5%] left-[3%] w-28 h-28 opacity-10 -rotate-12" />
          <img src="/icon.png" alt="" className="absolute top-[8%] right-[5%] w-24 h-24 opacity-20 rotate-[20deg] rounded-2xl" />
          <img src="/logo-socialab.png" alt="" className="absolute top-[15%] left-[20%] w-20 h-20 opacity-8 rotate-[25deg]" />
          <img src="/icon.png" alt="" className="absolute top-[12%] right-[22%] w-16 h-16 opacity-15 -rotate-[15deg] rounded-xl" />
          <img src="/logo-socialab.png" alt="" className="absolute top-[35%] left-[2%] w-24 h-24 opacity-10 rotate-[45deg]" />
          <img src="/icon.png" alt="" className="absolute top-[40%] right-[2%] w-20 h-20 opacity-15 -rotate-[30deg] rounded-xl" />
          <img src="/logo-socialab.png" alt="" className="absolute top-[55%] left-[8%] w-18 h-18 opacity-8 -rotate-[20deg]" />
          <img src="/icon.png" alt="" className="absolute top-[60%] right-[6%] w-22 h-22 opacity-20 rotate-[35deg] rounded-2xl" />
          <img src="/logo-socialab.png" alt="" className="absolute bottom-[25%] left-[5%] w-26 h-26 opacity-10 rotate-[15deg]" />
          <img src="/icon.png" alt="" className="absolute bottom-[30%] right-[4%] w-18 h-18 opacity-15 -rotate-[45deg] rounded-lg" />
          <img src="/logo-socialab.png" alt="" className="absolute bottom-[12%] left-[15%] w-22 h-22 opacity-8 rotate-[50deg]" />
          <img src="/icon.png" alt="" className="absolute bottom-[8%] right-[18%] w-20 h-20 opacity-20 rotate-[10deg] rounded-xl" />
          <img src="/logo-socialab.png" alt="" className="absolute bottom-[5%] left-[35%] w-16 h-16 opacity-5 -rotate-[35deg]" />
          <img src="/icon.png" alt="" className="absolute bottom-[3%] right-[35%] w-14 h-14 opacity-10 rotate-[55deg] rounded-lg" />
          <img src="/logo-socialab.png" alt="" className="absolute top-[75%] left-[1%] w-20 h-20 opacity-8 rotate-[70deg]" />
          <img src="/icon.png" alt="" className="absolute top-[25%] right-[12%] w-12 h-12 opacity-10 -rotate-[60deg] rounded-lg" />

          <div className="text-center relative z-10 -mt-20">
            <img src="/logo-socialab.png" alt="Socialab" className="w-48 h-48 mx-auto -mb-6" />
            <p className="text-white/40 mb-2">Seu laboratório de Mídia Social</p>
            <SignIn
              appearance={{
                elements: {
                  rootBox: "mx-auto",
                  card: "bg-[#0a0a0a] border border-white/10",
                  headerTitle: "text-white",
                  headerSubtitle: "text-white/50",
                  socialButtonsBlockButton:
                    "bg-white/5 border-white/10 text-white hover:bg-white/10",
                  formFieldLabel: "text-white/70",
                  formFieldInput: "bg-white/5 border-white/10 text-white",
                  footerActionLink: "text-amber-500 hover:text-amber-400",
                  identityPreviewText: "text-white",
                  identityPreviewEditButton: "text-amber-500",
                  formButtonPrimary: "bg-white text-black hover:bg-white/90",
                },
              }}
            />
          </div>
        </div>
      </SignedOut>
      <SignedIn>{children}</SignedIn>
    </AuthContext.Provider>
  );
}

export function UserProfileButton() {
  return (
    <UserButton
      afterSignOutUrl="/"
      appearance={{
        elements: {
          avatarBox: "w-8 h-8",
        },
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
    name: user?.fullName || user?.firstName || "User",
    avatarUrl: user?.imageUrl,
  };
}
