import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DAILY_LIMIT, todayUTC } from "./pantry";

async function uid() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Not signed in");
  return data.user.id;
}

export const profileQuery = queryOptions({
  queryKey: ["profile"],
  queryFn: async () => {
    const id = await uid();
    const { data, error } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data;
  },
});

export const usageQuery = queryOptions({
  queryKey: ["usage", todayUTC()],
  queryFn: async () => {
    const id = await uid();
    const { data, error } = await supabase.from("generation_usage").select("count").eq("user_id", id).eq("usage_date", todayUTC()).maybeSingle();
    if (error) throw error;
    return Math.max(0, DAILY_LIMIT - (data?.count ?? 0));
  },
});

export const historyQuery = queryOptions({
  queryKey: ["history"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("recipes")
      .select("id,title,cuisine,cook_time_minutes,created_at,recipe_feedback(rating)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
});

export const recipeQuery = (id: string) =>
  queryOptions({
    queryKey: ["recipe", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("recipes").select("*, recipe_feedback(rating,reason)").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

export const recipesByIdsQuery = (ids: string[]) =>
  queryOptions({
    queryKey: ["recipes", ids],
    queryFn: async () => {
      if (!ids.length) return [];
      const { data, error } = await supabase.from("recipes").select("*").in("id", ids).order("created_at");
      if (error) throw error;
      return data;
    },
  });
