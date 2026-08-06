import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/components/StoreProvider';
import { supabase } from '@/integrations/supabase/client';
import { User, Target, BookOpen, LogOut, Camera, Loader2, Check, X, Pencil } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Profile() {
  const { stats, words, updateStats } = useStore();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string>('');
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      setEmail(user.email || '');
      const { data } = await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) {
        setDisplayName(data.display_name || '');
        setAvatarUrl(data.avatar_url);
      }
    };
    load();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const startEditName = () => {
    setNameDraft(displayName);
    setEditingName(true);
  };

  const saveName = async () => {
    if (!userId) return;
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      toast({ title: 'Naam mag niet leeg zijn', variant: 'destructive' });
      return;
    }
    setSavingName(true);
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: trimmed })
      .eq('user_id', userId);
    setSavingName(false);
    if (error) {
      toast({ title: 'Fout bij opslaan', description: error.message, variant: 'destructive' });
      return;
    }
    setDisplayName(trimmed);
    setEditingName(false);
    toast({ title: 'Naam bijgewerkt' });
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Alleen afbeeldingen toegestaan', variant: 'destructive' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Bestand te groot (max 5 MB)', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${userId}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, cacheControl: '3600' });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = pub.publicUrl;
      const { error: updErr } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('user_id', userId);
      if (updErr) throw updErr;
      setAvatarUrl(publicUrl);
      toast({ title: 'Profielfoto bijgewerkt' });
    } catch (err: any) {
      toast({ title: 'Upload mislukt', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeAvatar = async () => {
    if (!userId) return;
    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: null })
      .eq('user_id', userId);
    if (error) {
      toast({ title: 'Fout', description: error.message, variant: 'destructive' });
      return;
    }
    setAvatarUrl(null);
    toast({ title: 'Profielfoto verwijderd' });
  };

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div className="text-center">
        <div className="relative inline-block group">
          <div className="h-24 w-24 rounded-full bg-active mx-auto flex items-center justify-center overflow-hidden">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Profielfoto" className="h-full w-full object-cover" />
            ) : (
              <User className="h-12 w-12 text-primary-foreground" />
            )}
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="absolute bottom-0 right-0 h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:opacity-90 disabled:opacity-50"
            aria-label="Profielfoto wijzigen"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
        </div>
        {avatarUrl && (
          <button
            onClick={removeAvatar}
            className="mt-2 text-xs text-muted-foreground hover:text-destructive transition-colors"
          >
            Foto verwijderen
          </button>
        )}

        <div className="mt-4 flex items-center justify-center gap-2">
          {editingName ? (
            <>
              <input
                value={nameDraft}
                onChange={e => setNameDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveName();
                  if (e.key === 'Escape') setEditingName(false);
                }}
                autoFocus
                maxLength={40}
                className="rounded-lg bg-background/60 border border-border px-3 py-1.5 text-base text-foreground text-center focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                onClick={saveName}
                disabled={savingName}
                className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 disabled:opacity-50"
                aria-label="Opslaan"
              >
                {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              </button>
              <button
                onClick={() => setEditingName(false)}
                className="h-8 w-8 rounded-lg bg-secondary text-secondary-foreground flex items-center justify-center hover:bg-secondary/80"
                aria-label="Annuleren"
              >
                <X className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <h1 className="text-xl font-bold text-foreground">{displayName || 'Naamloos'}</h1>
              <button
                onClick={startEditName}
                className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/50 flex items-center justify-center transition-colors"
                aria-label="Naam wijzigen"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-1">{email}</p>
      </div>

      <div className="bg-card rounded-xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Target className="h-4 w-4 text-accent" /> Dagdoel
        </h3>
        <div className="flex items-center gap-3">
          {[12, 18, 24, 32].map(goal => (
            <button
              key={goal}
              onClick={() => updateStats({ dailyGoal: goal })}
              className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition-all ${
                stats.dailyGoal === goal
                  ? 'bg-active text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}
            >
              {goal}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">woorden per dag</p>
      </div>

      <div className="bg-card rounded-xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" /> Overzicht
        </h3>
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Totale woorden</span>
            <span className="text-sm font-medium text-foreground">{words.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Stabiele woorden</span>
            <span className="text-sm font-medium text-active">{words.filter(w => w.status === 'stable').length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Langste streak</span>
            <span className="text-sm font-medium text-active">{stats.longestStreak} dagen</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Totaal sessies</span>
            <span className="text-sm font-medium text-foreground">{stats.totalSessions}</span>
          </div>
        </div>
      </div>

      <button
        onClick={handleSignOut}
        className="w-full flex items-center justify-center gap-2 rounded-lg border border-border py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
      >
        <LogOut className="h-4 w-4" /> Uitloggen
      </button>
    </div>
  );
}
