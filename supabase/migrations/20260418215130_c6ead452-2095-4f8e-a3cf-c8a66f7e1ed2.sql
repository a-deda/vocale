ALTER TABLE public.user_stats
ADD COLUMN IF NOT EXISTS streak_freezes integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS freezes_earned_at_streak integer NOT NULL DEFAULT 0;