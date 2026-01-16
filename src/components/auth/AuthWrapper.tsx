import React, { useEffect, useState, createContext, useContext, useRef } from "react";
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
  isDbSyncing: boolean;
}

const AuthContext = createContext<AuthContextType>({
  dbUser: null,
  isLoading: true,
  userId: null,
  clerkUserId: null,
  isDbSyncing: false,
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
  const [isDbSyncing, setIsDbSyncing] = useState(false);

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
        setIsDbSyncing(false);
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
          setIsDbSyncing(false);
          return;
        }

        console.debug("[Auth] Syncing user to database (background)...");
        setIsDbSyncing(true);

        const syncedUser = await getOrCreateUser({
          email: userEmail,
          name: userName,
          avatar_url: userImage,
          auth_provider: "clerk",
          auth_provider_id: clerkUserId,
        });

        setDbUser(syncedUser);
        syncedUserIdRef.current = clerkUserId; // Mark as synced
        console.debug("[Auth] User synced successfully:", syncedUser.id);
      } catch (error) {
        console.error("Failed to sync user with database:", error);
        // Still allow access even if DB sync fails (fallback to clerk user)
        setDbUser({
          id: clerkUserId,
          email: userEmail || "",
          name: userName,
          avatar_url: userImage || null,
          created_at: new Date().toISOString(),
        });
        syncedUserIdRef.current = clerkUserId; // Still mark as synced to prevent retries
      } finally {
        setIsDbSyncing(false);
      }
    }

    syncUser();
  }, [clerkLoaded, isSignedIn, clerkUserId, userEmail, userName, userImage]);

  const contextValue: AuthContextType = {
    dbUser,
    // isLoading is now just Clerk loading - DB sync happens in background
    isLoading: !clerkLoaded,
    // userId uses clerkUserId as fallback for parallel data loading
    userId: dbUser?.id || clerkUserId || null,
    clerkUserId: clerkUserId || null,
    isDbSyncing,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      <SignedOut>
        <div className="min-h-screen grid grid-cols-2 bg-black overflow-hidden">
          {/* Left side: Icons */}
          <div className="relative flex items-center justify-center overflow-hidden border-r border-white/[0.08]">
            {/* Top row */}
            <img src="/logo-socialab.png" alt="" className="absolute top-[4%] left-[3%] w-24 h-24 opacity-10 -rotate-12" />
            <img src="/icon.png" alt="" className="absolute top-[7%] left-[20%] w-20 h-20 opacity-15 rotate-[20deg] rounded-2xl" />
            <img src="/logo-socialab.png" alt="" className="absolute top-[3%] left-[37%] w-18 h-18 opacity-8 rotate-[25deg]" />
            <img src="/icon.png" alt="" className="absolute top-[5%] left-[54%] w-16 h-16 opacity-12 rotate-[30deg] rounded-xl" />
            
            {/* Upper row 1 */}
            <img src="/icon.png" alt="" className="absolute top-[16%] left-[2%] w-22 h-22 opacity-12 -rotate-[15deg] rounded-xl" />
            <img src="/logo-socialab.png" alt="" className="absolute top-[18%] left-[18%] w-26 h-26 opacity-10 rotate-[45deg]" />
            <img src="/icon.png" alt="" className="absolute top-[20%] left-[35%] w-20 h-20 opacity-15 -rotate-[30deg] rounded-xl" />
            <img src="/logo-socialab.png" alt="" className="absolute top-[17%] left-[52%] w-18 h-18 opacity-8 rotate-[40deg]" />
            
            {/* Upper row 2 */}
            <img src="/logo-socialab.png" alt="" className="absolute top-[30%] left-[6%] w-20 h-20 opacity-9 -rotate-[25deg]" />
            <img src="/icon.png" alt="" className="absolute top-[33%] left-[23%] w-24 h-24 opacity-13 rotate-[50deg] rounded-2xl" />
            <img src="/logo-socialab.png" alt="" className="absolute top-[31%] left-[40%] w-22 h-22 opacity-7 rotate-[20deg]" />
            <img src="/icon.png" alt="" className="absolute top-[34%] left-[57%] w-16 h-16 opacity-11 -rotate-[40deg] rounded-lg" />
            
            {/* Center row */}
            <img src="/logo-socialab.png" alt="" className="absolute top-[40%] left-[8%] w-24 h-24 opacity-8 -rotate-[20deg]" />
            <img src="/icon.png" alt="" className="absolute top-[38%] left-[25%] w-28 h-28 opacity-20 rotate-[35deg] rounded-2xl" />
            <img src="/logo-socialab.png" alt="" className="absolute top-[42%] left-[42%] w-20 h-20 opacity-10 rotate-[15deg]" />
            <img src="/icon.png" alt="" className="absolute top-[39%] left-[59%] w-18 h-18 opacity-12 -rotate-[25deg] rounded-xl" />
            
            {/* Lower row 1 */}
            <img src="/icon.png" alt="" className="absolute top-[56%] left-[4%] w-22 h-22 opacity-15 -rotate-[45deg] rounded-lg" />
            <img src="/logo-socialab.png" alt="" className="absolute top-[58%] left-[21%] w-24 h-24 opacity-8 rotate-[50deg]" />
            <img src="/icon.png" alt="" className="absolute top-[55%] left-[38%] w-18 h-18 opacity-12 rotate-[10deg] rounded-xl" />
            <img src="/logo-socialab.png" alt="" className="absolute top-[57%] left-[55%] w-20 h-20 opacity-9 -rotate-[35deg]" />
            
            {/* Lower row 2 */}
            <img src="/logo-socialab.png" alt="" className="absolute top-[70%] left-[10%] w-22 h-22 opacity-7 rotate-[60deg]" />
            <img src="/icon.png" alt="" className="absolute top-[73%] left-[27%] w-20 h-20 opacity-14 -rotate-[20deg] rounded-xl" />
            <img src="/logo-socialab.png" alt="" className="absolute top-[71%] left-[44%] w-18 h-18 opacity-8 rotate-[30deg]" />
            <img src="/icon.png" alt="" className="absolute top-[74%] left-[61%] w-16 h-16 opacity-10 -rotate-[50deg] rounded-lg" />
            
            {/* Bottom row */}
            <img src="/logo-socialab.png" alt="" className="absolute bottom-[13%] left-[6%] w-20 h-20 opacity-5 -rotate-[35deg]" />
            <img src="/icon.png" alt="" className="absolute bottom-[10%] left-[23%] w-18 h-18 opacity-11 rotate-[55deg] rounded-lg" />
            <img src="/logo-socialab.png" alt="" className="absolute bottom-[12%] left-[40%] w-16 h-16 opacity-6 -rotate-[45deg]" />
            <img src="/icon.png" alt="" className="absolute bottom-[8%] left-[57%] w-14 h-14 opacity-9 rotate-[25deg] rounded-xl" />
            
            {/* Very bottom */}
            <img src="/logo-socialab.png" alt="" className="absolute bottom-[2%] left-[15%] w-18 h-18 opacity-5 rotate-[40deg]" />
            <img src="/icon.png" alt="" className="absolute bottom-[4%] left-[32%] w-16 h-16 opacity-8 -rotate-[30deg] rounded-lg" />
          </div>

          {/* Right side: Login */}
          <div className="flex items-center justify-center relative z-10 border-l border-white/[0.08]">
            <div className="text-center py-[18px] px-[3px] w-full max-w-md">
              <img src="/logo-socialab.png" alt="Socialab" className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-6 flex flex-wrap py-[3px]" />
              <p className="text-white/40 mb-6">Seu laboratório de Mídia Social</p>
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
