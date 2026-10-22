CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  preferred_cuisines text[] NOT NULL DEFAULT '{}',
  dietary_restrictions text[] NOT NULL DEFAULT '{}',
  max_cook_time_minutes int NOT NULL DEFAULT 30,
  protein_goal_g int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own profile select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name) VALUES (NEW.id, NEW.raw_user_meta_data->>'display_name') ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  cuisine text,
  cook_time_minutes int,
  servings int,
  ingredients jsonb NOT NULL DEFAULT '[]',
  missing_ingredients jsonb NOT NULL DEFAULT '[]',
  steps jsonb NOT NULL DEFAULT '[]',
  substitutions jsonb NOT NULL DEFAULT '[]',
  nutrition jsonb,
  input_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recipes_user_created_idx ON public.recipes (user_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.recipes TO authenticated;
GRANT ALL ON public.recipes TO service_role;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own recipes select" ON public.recipes FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own recipes insert" ON public.recipes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own recipes delete" ON public.recipes FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.recipe_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  rating text NOT NULL CHECK (rating IN ('helpful','unhelpful')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, recipe_id)
);
GRANT SELECT, INSERT, UPDATE ON public.recipe_feedback TO authenticated;
GRANT ALL ON public.recipe_feedback TO service_role;
ALTER TABLE public.recipe_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own feedback select" ON public.recipe_feedback FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own feedback insert" ON public.recipe_feedback FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own feedback update" ON public.recipe_feedback FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.generation_usage (
  user_id uuid NOT NULL,
  usage_date date NOT NULL,
  count int NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_date)
);
GRANT SELECT ON public.generation_usage TO authenticated;
GRANT ALL ON public.generation_usage TO service_role;
ALTER TABLE public.generation_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own usage select" ON public.generation_usage FOR SELECT TO authenticated USING (auth.uid() = user_id);