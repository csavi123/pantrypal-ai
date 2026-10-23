-- Pre-launch hardening. No table or column names change.
-- Constraints are added NOT VALID: they apply to every new or updated row without
-- failing on rows that already exist.

-- 1. Feedback may only be left on the user's own recipes (previously any recipe id was accepted).
DROP POLICY IF EXISTS "Own feedback insert" ON public.recipe_feedback;
DROP POLICY IF EXISTS "Own feedback update" ON public.recipe_feedback;
CREATE POLICY "Own feedback insert" ON public.recipe_feedback FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = recipe_id AND r.user_id = auth.uid())
  );
CREATE POLICY "Own feedback update" ON public.recipe_feedback FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = recipe_id AND r.user_id = auth.uid())
  );

-- 2. Least privilege. RLS already blocks these, but don't rely on it alone:
--    anon gets nothing, and generation_usage stays read-only for users.
REVOKE ALL ON public.profiles, public.recipes, public.recipe_feedback, public.generation_usage FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.generation_usage FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.profiles, public.recipes, public.recipe_feedback FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.consume_generation(uuid, int) FROM PUBLIC, anon, authenticated;

-- 3. Remove rows with the user when an account is deleted.
ALTER TABLE public.recipe_feedback
  ADD CONSTRAINT recipe_feedback_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.generation_usage
  ADD CONSTRAINT generation_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;

-- 4. Size and value limits, so direct API calls can't store oversized or out-of-range data.
ALTER TABLE public.recipe_feedback
  ADD CONSTRAINT recipe_feedback_reason_len CHECK (reason IS NULL OR char_length(reason) <= 500) NOT VALID;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_display_name_len CHECK (display_name IS NULL OR char_length(display_name) <= 60) NOT VALID,
  ADD CONSTRAINT profiles_protein_goal_range CHECK (protein_goal_g IS NULL OR protein_goal_g BETWEEN 0 AND 300) NOT VALID,
  ADD CONSTRAINT profiles_cook_time_allowed CHECK (max_cook_time_minutes IN (15, 30, 45, 60)) NOT VALID,
  ADD CONSTRAINT profiles_list_sizes CHECK (cardinality(preferred_cuisines) <= 10 AND cardinality(dietary_restrictions) <= 10) NOT VALID;
ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_title_len CHECK (char_length(title) <= 200) NOT VALID,
  ADD CONSTRAINT recipes_json_sizes CHECK (
    pg_column_size(ingredients) <= 65536
    AND pg_column_size(missing_ingredients) <= 16384
    AND pg_column_size(steps) <= 65536
    AND pg_column_size(substitutions) <= 16384
    AND (nutrition IS NULL OR pg_column_size(nutrition) <= 16384)
    AND (input_snapshot IS NULL OR pg_column_size(input_snapshot) <= 32768)
  ) NOT VALID;
