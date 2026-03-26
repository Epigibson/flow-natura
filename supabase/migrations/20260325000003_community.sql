-- =============================================
-- Community Module Tables
-- =============================================

-- Posts
CREATE TABLE IF NOT EXISTS public.community_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 2000),
  topic TEXT NOT NULL DEFAULT 'general' CHECK (topic IN ('logro', 'tip', 'pregunta', 'motivacion', 'general')),
  is_pinned BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Reactions (one per user per post per type)
CREATE TABLE IF NOT EXISTS public.community_reactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL CHECK (reaction_type IN ('love', 'fire', 'clap', 'save')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(post_id, user_id, reaction_type)
);

-- Comments
CREATE TABLE IF NOT EXISTS public.community_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 1000),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_community_posts_author ON public.community_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_community_posts_topic ON public.community_posts(topic);
CREATE INDEX IF NOT EXISTS idx_community_posts_created ON public.community_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_reactions_post ON public.community_reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_community_reactions_user ON public.community_reactions(user_id);
CREATE INDEX IF NOT EXISTS idx_community_comments_post ON public.community_comments(post_id);

-- Enable RLS
ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;

-- Posts policies: anyone logged in can read, only author can edit/delete
CREATE POLICY "community_posts_select" ON public.community_posts
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "community_posts_insert" ON public.community_posts
  FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY "community_posts_update" ON public.community_posts
  FOR UPDATE USING (auth.uid() = author_id);

CREATE POLICY "community_posts_delete" ON public.community_posts
  FOR DELETE USING (auth.uid() = author_id);

-- Reactions policies
CREATE POLICY "community_reactions_select" ON public.community_reactions
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "community_reactions_insert" ON public.community_reactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "community_reactions_delete" ON public.community_reactions
  FOR DELETE USING (auth.uid() = user_id);

-- Comments policies
CREATE POLICY "community_comments_select" ON public.community_comments
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "community_comments_insert" ON public.community_comments
  FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY "community_comments_delete" ON public.community_comments
  FOR DELETE USING (auth.uid() = author_id);

-- Updated_at trigger for posts
CREATE OR REPLACE FUNCTION public.update_community_post_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER community_posts_updated_at
  BEFORE UPDATE ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_community_post_timestamp();

-- View: post with aggregated reaction counts and comment count
CREATE OR REPLACE VIEW public.community_posts_with_stats AS
SELECT
  p.*,
  COALESCE(r.love_count, 0) AS love_count,
  COALESCE(r.fire_count, 0) AS fire_count,
  COALESCE(r.clap_count, 0) AS clap_count,
  COALESCE(r.save_count, 0) AS save_count,
  COALESCE(c.comment_count, 0) AS comment_count
FROM public.community_posts p
LEFT JOIN (
  SELECT
    post_id,
    COUNT(*) FILTER (WHERE reaction_type = 'love') AS love_count,
    COUNT(*) FILTER (WHERE reaction_type = 'fire') AS fire_count,
    COUNT(*) FILTER (WHERE reaction_type = 'clap') AS clap_count,
    COUNT(*) FILTER (WHERE reaction_type = 'save') AS save_count
  FROM public.community_reactions
  GROUP BY post_id
) r ON r.post_id = p.id
LEFT JOIN (
  SELECT post_id, COUNT(*) AS comment_count
  FROM public.community_comments
  GROUP BY post_id
) c ON c.post_id = p.id;
