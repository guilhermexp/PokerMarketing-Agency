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
    // PERF: Always use clerkUserId for consistent SWR cache keys
    // Server resolves clerkUserId -> dbUser.id via resolveUserId() with caching
    // This prevents double-fetch when dbUser syncs (userId changing invalidates cache)
    userId: clerkUserId || null,
    clerkUserId: clerkUserId || null,
    isDbSyncing,
  };

  const signInAppearance = {
    elements: {
      rootBox: "mx-auto flex w-full justify-center",
      cardBox: "w-full max-w-[430px]",
      card: "w-full border-0 bg-transparent p-0 shadow-none",
      headerTitle: "text-2xl font-semibold tracking-tight text-white",
      headerSubtitle: "text-sm text-muted-foreground",
      socialButtonsBlockButton:
        "h-11 rounded-xl border border-white/15 bg-white/5 text-white transition-colors hover:bg-white/10",
      socialButtonsBlockButtonText: "text-sm font-medium text-white",
      dividerLine: "bg-white/10",
      dividerText: "text-xs uppercase tracking-[0.2em] text-muted-foreground",
      formFieldLabel: "text-sm font-medium text-white/75",
      formFieldInput:
        "h-11 rounded-xl border border-white/15 bg-black/40 text-white placeholder:text-white/35 transition-colors focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20",
      formFieldAction: "text-amber-400 transition-colors hover:text-amber-300",
      formButtonPrimary:
        "h-11 rounded-xl border border-neutral-700 bg-gradient-to-r from-neutral-900 to-neutral-700 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(0,0,0,0.35)] transition-all hover:from-neutral-800 hover:to-neutral-600",
      footerActionText: "text-muted-foreground",
      footerActionLink: "font-medium text-amber-400 transition-colors hover:text-amber-300",
      formResendCodeLink: "text-amber-400 transition-colors hover:text-amber-300",
      identityPreviewText: "text-white/80",
      identityPreviewEditButton: "text-amber-400 transition-colors hover:text-amber-300",
      otpCodeFieldInput:
        "rounded-xl border border-white/15 bg-black/40 text-white focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20",
      alert: "rounded-xl border border-amber-300/20 bg-amber-500/10 text-amber-100",
      formFieldSuccessText: "text-emerald-300",
    },
  } as const;

  return (
    <AuthContext.Provider value={contextValue}>
      <SignedOut>
        <div className="relative min-h-screen overflow-hidden bg-background text-white">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-amber-500/20 blur-3xl" />
            <div className="absolute right-[-8rem] top-[20%] h-96 w-96 rounded-full bg-white/[0.08] blur-3xl" />
            <div className="absolute bottom-[-5rem] left-[30%] h-72 w-72 rounded-full bg-amber-300/15 blur-3xl" />
            <div
              className="absolute inset-0 opacity-[0.05]"
              style={{
                backgroundImage:
                  "linear-gradient(to right, rgba(255,255,255,0.35) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.35) 1px, transparent 1px)",
                backgroundSize: "56px 56px",
              }}
            />
          </div>

          <div className="relative mx-auto grid min-h-screen w-full max-w-[1360px] lg:grid-cols-[1.05fr_0.95fr]">
            <div className="relative hidden border-r border-border px-10 py-16 lg:flex lg:flex-col">
              <img src="/logo-socialab.png" alt="Social Lab" className="h-12 w-12" />
              <div className="mt-auto">
                <p className="max-w-md text-4xl font-semibold leading-tight tracking-tight text-white">
                  Plataforma profissional para operacao criativa de Midia Social.
                </p>
                <p className="mt-5 max-w-md text-base leading-relaxed text-white/55">
                  Centralize campanhas, producao e performance em um unico fluxo com padrao de agencia.
                </p>
              </div>

              <img
                src="/icon.png"
                alt=""
                aria-hidden="true"
                className="absolute left-[12%] top-[14%] h-20 w-20 rotate-[-18deg] rounded-2xl opacity-20"
              />
              <img
                src="/logo-socialab.png"
                alt=""
                aria-hidden="true"
                className="absolute right-[10%] top-[38%] h-24 w-24 rotate-[20deg] opacity-[0.15]"
              />
              <img
                src="/icon.png"
                alt=""
                aria-hidden="true"
                className="absolute bottom-[11%] right-[18%] h-16 w-16 rotate-[22deg] rounded-xl opacity-[0.18]"
              />
            </div>

            <div className="relative flex items-center justify-center px-4 py-8 sm:px-8 sm:py-12">
              <div className="w-full max-w-[520px] rounded-[28px] border border-border bg-black/[0.45] p-6 shadow-[0_22px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-8">
                <div className="mb-8 text-center">
                  <img src="/logo-socialab.png" alt="Social Lab" className="mx-auto h-14 w-14 sm:h-16 sm:w-16" />
                  <h1 className="mt-5 text-2xl font-semibold tracking-tight text-white sm:text-[1.85rem]">
                    Bem-vindo ao Social Lab
                  </h1>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Entre para continuar com sua operacao de marketing.
                  </p>
                </div>
                <SignIn appearance={signInAppearance} />
              </div>
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
