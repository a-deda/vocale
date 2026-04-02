import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable/index';
import { BookOpen, Mail, Lock, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { toast } = useToast();

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast({ title: 'Fout', description: String(result.error), variant: 'destructive' });
      }
      if (result.redirected) return;
    } catch (err: any) {
      toast({ title: 'Fout', description: err.message, variant: 'destructive' });
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        toast({ title: 'Account aangemaakt!', description: 'Controleer je e-mail voor bevestiging.' });
      }
    } catch (err: any) {
      toast({ title: 'Fout', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-8 animate-slide-up">
        <div className="text-center">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl gradient-primary mb-4">
            <BookOpen className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold text-gradient-primary">Lexis</h1>
          <p className="text-sm text-muted-foreground mt-2">
            {isLogin ? 'Welkom terug! Log in om verder te leren.' : 'Maak een account aan om te beginnen.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="glass-card rounded-xl p-5 space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">E-mail</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full rounded-lg bg-background/60 border border-border pl-10 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="jouw@email.nl"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Wachtwoord</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full rounded-lg bg-background/60 border border-border pl-10 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full gradient-primary rounded-xl py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50 hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {isLogin ? 'Inloggen' : 'Account Aanmaken'}
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          {isLogin ? 'Nog geen account?' : 'Al een account?'}{' '}
          <button onClick={() => setIsLogin(!isLogin)} className="text-primary font-medium hover:underline">
            {isLogin ? 'Registreren' : 'Inloggen'}
          </button>
        </p>
      </div>
    </div>
  );
}
