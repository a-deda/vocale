ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS eta_history jsonb NOT NULL DEFAULT '[]'::jsonb;