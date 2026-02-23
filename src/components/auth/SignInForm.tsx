import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";

interface SignInFormProps {
  onSwitchToSignUp: () => void;
}

export function SignInForm({ onSwitchToSignUp }: SignInFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setError(null);
    const result = await authClient.signIn.email({
      email,
      password,
      rememberMe,
      fetchOptions: {
        onRequest: () => setLoading(true),
        onResponse: () => setLoading(false),
      },
    });
    if (result.error) {
      const code = result.error.code;
      if (code === "INVALID_PASSWORD" || code === "INVALID_EMAIL_OR_PASSWORD") {
        setError("Email ou senha incorretos.");
      } else if (code === "USER_NOT_FOUND") {
        setError("Nenhuma conta encontrada com este email.");
      } else if (code === "TOO_MANY_REQUESTS") {
        setError("Muitas tentativas. Tente novamente em alguns minutos.");
      } else {
        setError(result.error.message || "Erro ao fazer login.");
      }
    }
  };

  return (
    <div className="flex h-full w-full flex-col justify-between px-8 py-10 sm:px-12 sm:py-14 lg:px-16 lg:py-16">
      {/* Top - Create an account link */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onSwitchToSignUp}
          className="text-sm text-white/50 hover:text-white transition-colors cursor-pointer"
        >
          Criar conta
        </button>
      </div>

      {/* Middle - Form */}
      <div className="flex-1 flex flex-col justify-center max-w-lg">
        <h1 className="text-5xl sm:text-6xl font-light tracking-tight text-white mb-14">
          Login
        </h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
          <div className="grid gap-2">
            <Label
              htmlFor="email"
              className="text-xs text-white/40 font-medium"
            >
              Email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="seu@email.com"
              required
              onChange={(e) => setEmail(e.target.value)}
              value={email}
            />
          </div>

          <div className="grid gap-2">
            <Label
              htmlFor="password"
              className="text-xs text-white/40 font-medium"
            >
              Senha
            </Label>
            <Input
              id="password"
              type="password"
              placeholder="senha"
              autoComplete="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-300/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-200 mt-4">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between mt-5">
          <div className="flex items-center gap-2">
            <Checkbox
              id="remember"
              onClick={() => setRememberMe(!rememberMe)}
            />
            <Label htmlFor="remember" className="text-sm text-white/40">
              Lembrar de mim
            </Label>
          </div>
          <button
            type="button"
            className="text-sm text-white/30 hover:text-white/60 transition-colors cursor-pointer"
            onClick={() => {
              /* TODO: forgot password */
            }}
          >
            Esqueceu?
          </button>
        </div>

        {/* Social login - subtle links */}
        <div className="flex items-center gap-3 mt-10">
          <span className="text-xs text-white/20 uppercase tracking-wider">
            ou entre com
          </span>
          <button
            type="button"
            disabled={loading}
            onClick={async () => {
              await authClient.signIn.social({
                provider: "github",
                callbackURL: "/",
                fetchOptions: {
                  onRequest: () => setLoading(true),
                  onResponse: () => setLoading(false),
                },
              });
            }}
            className="flex items-center gap-1.5 text-sm text-white/30 hover:text-white/60 transition-colors cursor-pointer disabled:opacity-50"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
            >
              <path
                fill="currentColor"
                d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5c.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34c-.46-1.16-1.11-1.47-1.11-1.47c-.91-.62.07-.6.07-.6c1 .07 1.53 1.03 1.53 1.03c.87 1.52 2.34 1.07 2.91.83c.09-.65.35-1.09.63-1.34c-2.22-.25-4.55-1.11-4.55-4.92c0-1.11.38-2 1.03-2.71c-.1-.25-.45-1.29.1-2.64c0 0 .84-.27 2.75 1.02c.79-.22 1.65-.33 2.5-.33s1.71.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02c.55 1.35.2 2.39.1 2.64c.65.71 1.03 1.6 1.03 2.71c0 3.82-2.34 4.66-4.57 4.91c.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2"
              />
            </svg>
            Github
          </button>
          <span className="text-white/15">|</span>
          <button
            type="button"
            disabled={loading}
            onClick={async () => {
              await authClient.signIn.social({
                provider: "google",
                callbackURL: "/",
                fetchOptions: {
                  onRequest: () => setLoading(true),
                  onResponse: () => setLoading(false),
                },
              });
            }}
            className="flex items-center gap-1.5 text-sm text-white/30 hover:text-white/60 transition-colors cursor-pointer disabled:opacity-50"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 256 262"
            >
              <path
                fill="currentColor"
                d="M255.878 133.451c0-10.734-.871-18.567-2.756-26.69H130.55v48.448h71.947c-1.45 12.04-9.283 30.172-26.69 42.356l-.244 1.622l38.755 30.023l2.685.268c24.659-22.774 38.875-56.282 38.875-96.027"
              />
              <path
                fill="currentColor"
                d="M130.55 261.1c35.248 0 64.839-11.605 86.453-31.622l-41.196-31.913c-11.024 7.688-25.82 13.055-45.257 13.055c-34.523 0-63.824-22.773-74.269-54.25l-1.531.13l-40.298 31.187l-.527 1.465C35.393 231.798 79.49 261.1 130.55 261.1"
              />
              <path
                fill="currentColor"
                d="M56.281 156.37c-2.756-8.123-4.351-16.827-4.351-25.82c0-8.994 1.595-17.697 4.206-25.82l-.073-1.73L15.26 71.312l-1.335.635C5.077 89.644 0 109.517 0 130.55s5.077 40.905 13.925 58.602z"
              />
              <path
                fill="currentColor"
                d="M130.55 50.479c24.514 0 41.05 10.589 50.479 19.438l36.844-35.974C195.245 12.91 165.798 0 130.55 0C79.49 0 35.393 29.301 13.925 71.947l42.211 32.783c10.59-31.477 39.891-54.251 74.414-54.251"
              />
            </svg>
            Google
          </button>
        </div>
      </div>

      {/* Bottom - Circular Sign In button */}
      <div className="flex justify-end">
        <button
          type="button"
          disabled={loading}
          onClick={handleSignIn}
          className="flex h-20 w-20 items-center justify-center rounded-full bg-white text-black text-[10px] font-semibold uppercase tracking-widest hover:scale-105 active:scale-95 transition-all disabled:opacity-50 cursor-pointer shadow-[0_0_40px_rgba(255,255,255,0.08)]"
        >
          {loading ? (
            <Loader2 size={20} className="animate-spin text-black" />
          ) : (
            "ENTRAR"
          )}
        </button>
      </div>
    </div>
  );
}
