import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Film, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  startSignup,
  verifySignup,
  emailFromIdentifier,
  startPasswordReset,
  completePasswordReset,
} from "@/lib/auth.functions";
import { getPublicSettings } from "@/lib/settings.functions";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup", "forgot"]).optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot";
type Step = "form" | "otp" | "reset-password";

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [mode, setMode] = useState<Mode>(search.mode ?? "signin");
  const [step, setStep] = useState<Step>("form");
  const [loading, setLoading] = useState(false);

  // Shared fields
  const [identifier, setIdentifier] = useState(""); // login: whatsapp or email
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [otpWhatsapp, setOtpWhatsapp] = useState("");
  const [signupToken, setSignupToken] = useState("");
  const [devHint, setDevHint] = useState<string | null>(null);

  const settingsFn = useServerFn(getPublicSettings);
  const { data: settings } = useQuery({
    queryKey: ["public-settings"],
    queryFn: () => settingsFn(),
  });

  const startSignupFn = useServerFn(startSignup);
  const verifySignupFn = useServerFn(verifySignup);
  const emailFromIdFn = useServerFn(emailFromIdentifier);
  const startResetFn = useServerFn(startPasswordReset);
  const completeResetFn = useServerFn(completePasswordReset);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/pedidos" });
    });
  }, [navigate]);

  useEffect(() => {
    setMode(search.mode ?? "signin");
    setStep("form");
  }, [search.mode]);

  const resetForm = () => {
    setStep("form");
    setCode("");
    setNewPassword("");
    setSignupToken("");
    setDevHint(null);
  };

  const handleSignin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { email: resolved } = await emailFromIdFn({ data: { identifier } });
      const { error } = await supabase.auth.signInWithPassword({ email: resolved, password });
      if (error) throw error;
      toast.success("Bem-vindo!");
      navigate({ to: "/pedidos" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao entrar";
      toast.error(msg.includes("Invalid login") ? "Senha incorreta" : msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSignupStart = async (e: React.FormEvent) => {
    e.preventDefault();
    const parse = z
      .object({
        email: z.string().email("E-mail inválido"),
        password: z.string().min(6, "Senha: mínimo 6 caracteres"),
        fullName: z.string().trim().min(2, "Informe seu nome").max(80),
        whatsapp: z.string().trim().min(10, "WhatsApp inválido (com DDD)").max(20),
      })
      .safeParse({ email, password, fullName, whatsapp });
    if (!parse.success) {
      toast.error(parse.error.issues[0].message);
      return;
    }
    setLoading(true);
    try {
      const res = await startSignupFn({
        data: { email, password, full_name: fullName, whatsapp },
      });
      setOtpWhatsapp(res.whatsapp);
      setSignupToken(res.token);
      setDevHint(res.devCode ? `Modo dev — código: ${res.devCode}` : null);
      setStep("otp");
      toast.success("Enviamos um código no seu WhatsApp.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao iniciar cadastro");
    } finally {
      setLoading(false);
    }
  };

  const handleSignupVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return toast.error("Digite o código de 6 dígitos.");
    if (!signupToken) return toast.error("Solicite um novo código.");
    setLoading(true);
    try {
      const verified = await verifySignupFn({
        data: { whatsapp: otpWhatsapp, code, token: signupToken },
      });
      const { error: signUpError } = await supabase.auth.signUp({
        email: verified.email,
        password,
        options: {
          data: {
            full_name: verified.full_name,
            whatsapp: verified.whatsapp,
          },
        },
      });
      if (signUpError) throw signUpError;

      const { error } = await supabase.auth.signInWithPassword({ email: verified.email, password });
      if (error) throw error;
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        await (supabase.from("profiles") as never as {
          upsert: (values: Record<string, unknown>) => Promise<unknown>;
        }).upsert({
          id: userData.user.id,
          full_name: verified.full_name,
          whatsapp: verified.whatsapp,
          email: verified.email,
        });
        await (supabase.from("user_roles") as never as {
          insert: (values: Record<string, unknown>) => Promise<unknown>;
        }).insert({ user_id: userData.user.id, role: "cliente" });
      }
      toast.success("Conta criada!");
      navigate({ to: "/pedidos" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Código inválido");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (whatsapp.trim().length < 10) return toast.error("WhatsApp inválido");
    setLoading(true);
    try {
      const res = await startResetFn({ data: { whatsapp } });
      setOtpWhatsapp(res.whatsapp);
      setDevHint(res.devCode ? `Modo dev — código: ${res.devCode}` : null);
      setStep("reset-password");
      toast.success("Código enviado no WhatsApp.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return toast.error("Digite o código.");
    if (newPassword.length < 6) return toast.error("Nova senha: mínimo 6 caracteres.");
    setLoading(true);
    try {
      const { email: emailOut } = await completeResetFn({
        data: { whatsapp: otpWhatsapp, code, new_password: newPassword },
      });
      const { error } = await supabase.auth.signInWithPassword({
        email: emailOut,
        password: newPassword,
      });
      if (error) throw error;
      toast.success("Senha redefinida!");
      navigate({ to: "/pedidos" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center gap-2 justify-center mb-8">
          {settings?.logo_url ? (
            <img src={settings.logo_url} alt="" className="h-10 w-auto" />
          ) : (
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center glow-primary">
              <Film className="h-4 w-4 text-primary-foreground" />
            </div>
          )}
          <span className="font-display font-bold text-xl">{settings?.site_name ?? "Portal VOD"}</span>
        </Link>

        <div className="glass-card rounded-2xl p-8">
          {mode === "signin" && (
            <>
              <h1 className="font-display text-2xl font-bold mb-1">Bem-vindo de volta</h1>
              <p className="text-sm text-muted-foreground mb-6">Entre com WhatsApp ou e-mail.</p>
              <form onSubmit={handleSignin} className="space-y-4">
                <div>
                  <Label htmlFor="identifier">WhatsApp ou e-mail</Label>
                  <Input
                    id="identifier"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="5511999999999 ou voce@email.com"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="password">Senha</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full h-11" disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Entrar
                </Button>
              </form>
              <div className="flex justify-between text-sm mt-4">
                <button
                  onClick={() => {
                    setMode("forgot");
                    resetForm();
                  }}
                  className="text-muted-foreground hover:text-primary"
                >
                  Esqueci minha senha
                </button>
                <button
                  onClick={() => {
                    setMode("signup");
                    resetForm();
                  }}
                  className="text-primary hover:underline font-medium"
                >
                  Criar conta
                </button>
              </div>
            </>
          )}

          {mode === "signup" && step === "form" && (
            <>
              <h1 className="font-display text-2xl font-bold mb-1">Criar sua conta</h1>
              <p className="text-sm text-muted-foreground mb-6">
                Você receberá um código no seu WhatsApp para confirmar.
              </p>
              <form onSubmit={handleSignupStart} className="space-y-4">
                <div>
                  <Label htmlFor="full">Nome completo</Label>
                  <Input id="full" value={fullName} onChange={(e) => setFullName(e.target.value)} required maxLength={80} />
                </div>
                <div>
                  <Label htmlFor="wa">WhatsApp (com DDD) *</Label>
                  <Input
                    id="wa"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="5511999999999"
                    required
                    maxLength={20}
                  />
                </div>
                <div>
                  <Label htmlFor="mail">E-mail</Label>
                  <Input id="mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div>
                  <Label htmlFor="pwd">Senha</Label>
                  <Input id="pwd" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
                </div>
                <Button type="submit" className="w-full h-11" disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Enviar código no WhatsApp
                </Button>
              </form>
              <p className="text-center text-sm mt-4">
                Já tem conta?{" "}
                <button onClick={() => setMode("signin")} className="text-primary hover:underline font-medium">
                  Entrar
                </button>
              </p>
            </>
          )}

          {mode === "signup" && step === "otp" && (
            <>
              <h1 className="font-display text-2xl font-bold mb-1">Digite o código</h1>
              <p className="text-sm text-muted-foreground mb-6">
                Enviamos um código de 6 dígitos para o WhatsApp {otpWhatsapp}.
              </p>
              {devHint && (
                <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs text-yellow-200 mb-4">
                  {devHint}
                </div>
              )}
              <form onSubmit={handleSignupVerify} className="space-y-4">
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  inputMode="numeric"
                  className="text-center text-2xl tracking-widest h-14"
                />
                <Button type="submit" className="w-full h-11" disabled={loading || code.length !== 6}>
                  {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Confirmar e criar conta
                </Button>
                <button
                  type="button"
                  onClick={() => setStep("form")}
                  className="w-full text-sm text-muted-foreground hover:text-primary"
                >
                  Voltar
                </button>
              </form>
            </>
          )}

          {mode === "forgot" && step === "form" && (
            <>
              <h1 className="font-display text-2xl font-bold mb-1">Esqueci minha senha</h1>
              <p className="text-sm text-muted-foreground mb-6">
                Informe seu WhatsApp para receber um código de recuperação.
              </p>
              <form onSubmit={handleForgotStart} className="space-y-4">
                <div>
                  <Label htmlFor="fwa">WhatsApp cadastrado</Label>
                  <Input
                    id="fwa"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="5511999999999"
                    required
                  />
                </div>
                <Button type="submit" className="w-full h-11" disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Enviar código
                </Button>
              </form>
              <p className="text-center text-sm mt-4">
                <button onClick={() => setMode("signin")} className="text-primary hover:underline">
                  Voltar ao login
                </button>
              </p>
            </>
          )}

          {mode === "forgot" && step === "reset-password" && (
            <>
              <h1 className="font-display text-2xl font-bold mb-1">Defina uma nova senha</h1>
              <p className="text-sm text-muted-foreground mb-6">
                Digite o código enviado para {otpWhatsapp} e sua nova senha.
              </p>
              {devHint && (
                <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs text-yellow-200 mb-4">
                  {devHint}
                </div>
              )}
              <form onSubmit={handleForgotComplete} className="space-y-4">
                <div>
                  <Label>Código (6 dígitos)</Label>
                  <Input
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    inputMode="numeric"
                    className="text-center text-2xl tracking-widest h-14"
                  />
                </div>
                <div>
                  <Label>Nova senha</Label>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    minLength={6}
                  />
                </div>
                <Button type="submit" className="w-full h-11" disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Redefinir senha
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
