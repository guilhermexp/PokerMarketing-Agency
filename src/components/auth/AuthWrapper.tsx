import React, { useEffect, useState, createContext, useContext, useRef } from "react";
import { authClient } from "../../lib/auth-client";
import { getOrCreateUser, type DbUser } from "../../services/apiClient";
import { SignInForm } from "./SignInForm";
import { SignUpForm } from "./SignUpForm";

interface AuthContextType {
  dbUser: DbUser | null;
  isLoading: boolean;
  userId: string | null;
  clerkUserId: string | null;
  isDbSyncing: boolean;
  isOrgReady: boolean;
}

const AuthContext = createContext<AuthContextType>({
  dbUser: null,
  isLoading: true,
  userId: null,
  clerkUserId: null,
  isDbSyncing: false,
  isOrgReady: false,
});

export function useAuth() {
  return useContext(AuthContext);
}

interface AuthWrapperProps {
  children: React.ReactNode;
}

/** Geometric star / compass SVG for the left panel */
function GeometricStar() {
  return (
    <svg
      viewBox="0 0 400 400"
      className="w-48 h-48 sm:w-56 sm:h-56 lg:w-72 lg:h-72"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Main cross */}
      <line x1="200" y1="40" x2="200" y2="360" stroke="white" strokeWidth="2.5" />
      <line x1="40" y1="200" x2="360" y2="200" stroke="white" strokeWidth="2.5" />
      {/* Diagonal lines */}
      <line x1="87" y1="87" x2="313" y2="313" stroke="white" strokeWidth="2" />
      <line x1="313" y1="87" x2="87" y2="313" stroke="white" strokeWidth="2" />
      {/* Secondary diagonals (22.5 deg) */}
      <line x1="140" y1="52" x2="260" y2="348" stroke="white" strokeWidth="1.5" />
      <line x1="260" y1="52" x2="140" y2="348" stroke="white" strokeWidth="1.5" />
      <line x1="52" y1="140" x2="348" y2="260" stroke="white" strokeWidth="1.5" />
      <line x1="52" y1="260" x2="348" y2="140" stroke="white" strokeWidth="1.5" />
    </svg>
  );
}

/** Subtle grid lines for left panel background */
function GridBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Subtle diagonal lines spanning the panel */}
      <svg
        className="absolute inset-0 w-full h-full"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <line x1="0%" y1="0%" x2="100%" y2="100%" stroke="white" strokeOpacity="0.04" strokeWidth="1" />
        <line x1="100%" y1="0%" x2="0%" y2="100%" stroke="white" strokeOpacity="0.04" strokeWidth="1" />
        <line x1="50%" y1="0%" x2="50%" y2="100%" stroke="white" strokeOpacity="0.04" strokeWidth="1" />
        <line x1="0%" y1="50%" x2="100%" y2="50%" stroke="white" strokeOpacity="0.04" strokeWidth="1" />
        {/* Extra subtle diagonals */}
        <line x1="30%" y1="0%" x2="0%" y2="60%" stroke="white" strokeOpacity="0.025" strokeWidth="1" />
        <line x1="70%" y1="0%" x2="100%" y2="60%" stroke="white" strokeOpacity="0.025" strokeWidth="1" />
        <line x1="0%" y1="40%" x2="30%" y2="100%" stroke="white" strokeOpacity="0.025" strokeWidth="1" />
        <line x1="100%" y1="40%" x2="70%" y2="100%" stroke="white" strokeOpacity="0.025" strokeWidth="1" />
      </svg>
    </div>
  );
}

export function AuthWrapper({ children }: AuthWrapperProps) {
  const { data: sessionData, isPending } = authClient.useSession();
  const [dbUser, setDbUser] = useState<DbUser | null>(null);
  const [isDbSyncing, setIsDbSyncing] = useState(false);
  const [isOrgReady, setIsOrgReady] = useState(false);
  const [authView, setAuthView] = useState<"signIn" | "signUp">("signIn");
  const [authEmailDraft, setAuthEmailDraft] = useState("");

  // Track if we've already synced this user to prevent duplicate calls
  const syncedUserIdRef = useRef<string | null>(null);

  const user = sessionData?.user;
  const isSignedIn = !!user;
  const betterAuthUserId = user?.id;
  const userEmail = user?.email;
  const userName = user?.name || "User";
  const userImage = user?.image;

  useEffect(() => {
    async function syncUser() {
      if (isPending) return;

      if (!isSignedIn || !betterAuthUserId) {
        setDbUser(null);
        setIsDbSyncing(false);
        setIsOrgReady(true);
        syncedUserIdRef.current = null;
        return;
      }

      // Skip if we've already synced this user
      if (syncedUserIdRef.current === betterAuthUserId) {
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
          avatar_url: userImage || undefined,
          auth_provider: "better-auth",
          auth_provider_id: betterAuthUserId,
        });

        setDbUser(syncedUser);
        syncedUserIdRef.current = betterAuthUserId;
        console.debug("[Auth] User synced successfully:", syncedUser.id);

        // Auto-activate organization if user has one but session doesn't
        try {
          const orgApi = authClient.organization as any;
          const session = sessionData?.session as any;
          if (!session?.activeOrganizationId) {
            const orgsResult = await orgApi.list({});
            const orgs = orgsResult?.data;
            if (orgs && orgs.length > 0) {
              console.debug("[Auth] No active org but user has", orgs.length, "org(s). Auto-activating:", orgs[0].name);
              await orgApi.setActive({ organizationId: orgs[0].id });
            }
          }
        } catch (orgErr) {
          console.warn("[Auth] Failed to auto-activate org:", orgErr);
        }
      } catch (error) {
        console.error("Failed to sync user with database:", error);
        setDbUser({
          id: betterAuthUserId,
          email: userEmail || "",
          name: userName,
          avatar_url: userImage || null,
          created_at: new Date().toISOString(),
        });
        syncedUserIdRef.current = betterAuthUserId;
      } finally {
        setIsDbSyncing(false);
        setIsOrgReady(true);
      }
    }

    syncUser();
  }, [isPending, isSignedIn, betterAuthUserId, userEmail, userName, userImage]);

  const contextValue: AuthContextType = {
    dbUser,
    isLoading: isPending,
    userId: betterAuthUserId || null,
    clerkUserId: betterAuthUserId || null,
    isDbSyncing,
    isOrgReady,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {isPending ? null : !isSignedIn ? (
        <div className="min-h-screen bg-black text-white">
          <div className="grid min-h-screen lg:grid-cols-[1fr_1fr]">
            {/* Left panel - Geometric star */}
            <div className="relative hidden lg:flex lg:flex-col bg-black overflow-hidden">
              <GridBackground />

              {/* Brand name */}
              <div className="relative z-10 px-10 pt-10">
                <div className="flex items-center gap-3">
                  <img
                    src="/logo-socialab.png"
                    alt="Social Lab"
                    className="h-8 w-8"
                  />
                  <span className="text-base font-semibold tracking-tight text-white">
                    Social Lab
                  </span>
                </div>
              </div>

              {/* Center star */}
              <div className="relative z-10 flex flex-1 items-center justify-center">
                <GeometricStar />
              </div>

              {/* Copyright */}
              <div className="relative z-10 px-10 pb-10">
                <p className="text-xs text-white/25">
                  &copy; Social Lab {new Date().getFullYear()}. Todos os direitos reservados.
                </p>
              </div>
            </div>

            {/* Right panel - Auth form */}
            <div className="relative flex bg-neutral-950/80 lg:border-l lg:border-white/[0.06]">
              {/* Mobile brand header */}
              <div className="absolute left-0 top-0 flex items-center gap-2 p-6 lg:hidden">
                <img
                  src="/logo-socialab.png"
                  alt="Social Lab"
                  className="h-8 w-8"
                />
                <span className="text-sm font-semibold text-white">
                  Social Lab
                </span>
              </div>

              {authView === "signIn" ? (
                <SignInForm
                  onSwitchToSignUp={(email) => {
                    if (email) setAuthEmailDraft(email);
                    setAuthView("signUp");
                  }}
                />
              ) : (
                <SignUpForm
                  initialEmail={authEmailDraft}
                  onSwitchToSignIn={(email) => {
                    if (email) setAuthEmailDraft(email);
                    setAuthView("signIn");
                  }}
                />
              )}
            </div>
          </div>
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}

export function UserProfileButton() {
  const { data: sessionData } = authClient.useSession();
  const user = sessionData?.user;

  const handleSignOut = async () => {
    await authClient.signOut();
  };

  return (
    <div className="relative group">
      <button
        className="flex items-center justify-center w-8 h-8 rounded-full bg-white/10 text-white text-sm font-medium overflow-hidden"
        title={user?.name || "User"}
      >
        {user?.image ? (
          <img src={user.image} alt={user.name || ""} className="w-full h-full object-cover" />
        ) : (
          <span>{(user?.name || "U").charAt(0).toUpperCase()}</span>
        )}
      </button>
      <div className="absolute right-0 top-full mt-1 w-40 rounded-xl border border-border bg-black/90 backdrop-blur-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
        <div className="p-2">
          <p className="px-2 py-1 text-xs text-white/60 truncate">{user?.email}</p>
          <button
            onClick={handleSignOut}
            className="w-full text-left px-2 py-1.5 text-sm text-red-400 hover:bg-white/5 rounded-lg transition-colors"
          >
            Sair
          </button>
        </div>
      </div>
    </div>
  );
}

export function useCurrentUser() {
  const { data: sessionData, isPending } = authClient.useSession();
  const { dbUser, userId } = useAuth();
  const user = sessionData?.user;

  return {
    user,
    dbUser,
    isLoaded: !isPending,
    isSignedIn: !!user,
    userId,
    clerkUserId: user?.id,
    email: user?.email,
    name: user?.name || "User",
    avatarUrl: user?.image,
  };
}
