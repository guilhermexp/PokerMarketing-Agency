import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { authClient } from "@/lib/auth-client";

interface SignUpFormProps {
  onSwitchToSignIn: () => void;
}

export function SignUpForm({ onSwitchToSignIn }: SignUpFormProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSignUp = async () => {
    if (password !== passwordConfirmation) {
      setError("As senhas nao coincidem.");
      return;
    }
    if (password.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    setError(null);

    await authClient.signUp.email({
      email,
      password,
      name: `${firstName} ${lastName}`.trim(),
      image: image ? await convertImageToBase64(image) : "",
      fetchOptions: {
        onResponse: () => setLoading(false),
        onRequest: () => setLoading(true),
        onError: (ctx) => {
          setError(ctx.error.message || "Falha ao criar conta.");
        },
      },
    });
  };

  return (
    <div className="flex h-full w-full flex-col justify-between px-8 py-10 sm:px-12 sm:py-14 lg:px-16 lg:py-16">
      {/* Top - Switch to login */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onSwitchToSignIn}
          className="text-sm text-white/50 hover:text-white transition-colors cursor-pointer"
        >
          Ja tem conta? Entrar
        </button>
      </div>

      {/* Middle - Form */}
      <div className="flex-1 flex flex-col justify-center max-w-lg">
        <h1 className="text-5xl sm:text-6xl font-light tracking-tight text-white mb-14">
          Criar conta
        </h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
          <div className="grid gap-2">
            <Label
              htmlFor="first-name"
              className="text-xs text-white/40 font-medium"
            >
              Nome
            </Label>
            <Input
              id="first-name"
              placeholder="Nome"
              required
              onChange={(e) => setFirstName(e.target.value)}
              value={firstName}
            />
          </div>
          <div className="grid gap-2">
            <Label
              htmlFor="last-name"
              className="text-xs text-white/40 font-medium"
            >
              Sobrenome
            </Label>
            <Input
              id="last-name"
              placeholder="Sobrenome"
              onChange={(e) => setLastName(e.target.value)}
              value={lastName}
            />
          </div>
        </div>

        <div className="grid gap-2 mt-4">
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 mt-4">
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
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="Minimo 8 caracteres"
            />
          </div>
          <div className="grid gap-2">
            <Label
              htmlFor="password_confirmation"
              className="text-xs text-white/40 font-medium"
            >
              Confirmar senha
            </Label>
            <Input
              id="password_confirmation"
              type="password"
              value={passwordConfirmation}
              onChange={(e) => setPasswordConfirmation(e.target.value)}
              autoComplete="new-password"
              placeholder="Repita a senha"
            />
          </div>
        </div>

        <div className="grid gap-2 mt-4">
          <Label
            htmlFor="image"
            className="text-xs text-white/40 font-medium"
          >
            Foto de perfil (opcional)
          </Label>
          <div className="flex items-end gap-4">
            {imagePreview && (
              <div className="relative w-12 h-12 rounded-lg overflow-hidden shrink-0">
                <img
                  src={imagePreview}
                  alt="Preview do perfil"
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="flex items-center gap-2 w-full">
              <Input
                id="image"
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="w-full"
              />
              {imagePreview && (
                <X
                  className="cursor-pointer text-white/30 hover:text-white/60 transition-colors shrink-0"
                  size={18}
                  onClick={() => {
                    setImage(null);
                    setImagePreview(null);
                  }}
                />
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-300/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-200 mt-4">
            {error}
          </div>
        )}
      </div>

      {/* Bottom - Circular Sign Up button */}
      <div className="flex justify-end">
        <button
          type="button"
          disabled={loading}
          onClick={handleSignUp}
          className="flex h-20 w-20 items-center justify-center rounded-full bg-white text-black text-[9px] font-semibold uppercase tracking-widest hover:scale-105 active:scale-95 transition-all disabled:opacity-50 cursor-pointer shadow-[0_0_40px_rgba(255,255,255,0.08)]"
        >
          {loading ? (
            <Loader2 size={20} className="animate-spin text-black" />
          ) : (
            "CRIAR"
          )}
        </button>
      </div>
    </div>
  );
}

async function convertImageToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
