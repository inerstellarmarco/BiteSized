export const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  licence TEXT NOT NULL DEFAULT '',
  ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
  position TEXT NOT NULL DEFAULT 'a0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  code TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  position TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sub_categories (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  code TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  level_tag TEXT NOT NULL DEFAULT '',
  toolkit JSONB NOT NULL DEFAULT '{}'::jsonb,
  position TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS lessons (
  id TEXT PRIMARY KEY,
  sub_category_id TEXT NOT NULL REFERENCES sub_categories(id) ON DELETE CASCADE,
  code TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  prerequisite_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  position TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sub_lessons (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  position TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS bites (
  id TEXT PRIMARY KEY,
  sub_lesson_id TEXT NOT NULL REFERENCES sub_lessons(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  source_note TEXT NOT NULL DEFAULT '',
  last_reviewed_on TEXT,
  diagram TEXT,
  position TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS bite_links (
  id TEXT PRIMARY KEY,
  bite_id TEXT NOT NULL REFERENCES bites(id) ON DELETE CASCADE,
  target_code TEXT NOT NULL,
  label TEXT NOT NULL,
  position TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  bite_id TEXT NOT NULL REFERENCES bites(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('multiple_choice', 'true_false', 'predict_output')),
  prompt TEXT NOT NULL,
  choices JSONB NOT NULL,
  correct_choice_id TEXT NOT NULL,
  explanation TEXT NOT NULL DEFAULT '',
  position TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS content_revisions (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  op TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  actor_profile_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  font_size TEXT NOT NULL DEFAULT 'md',
  theme TEXT NOT NULL DEFAULT 'system',
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS pin_attempts (
  id TEXT PRIMARY KEY,
  profile_id TEXT,
  ip TEXT NOT NULL DEFAULT '',
  success BOOLEAN NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  trusted BOOLEAN NOT NULL DEFAULT TRUE,
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS bite_progress (
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  bite_id TEXT NOT NULL REFERENCES bites(id) ON DELETE CASCADE,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (profile_id, bite_id)
);

CREATE TABLE IF NOT EXISTS learner_cursors (
  profile_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  sub_lesson_id TEXT NOT NULL,
  bite_id TEXT,
  mode TEXT NOT NULL DEFAULT 'learn',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sub_lesson_id TEXT NOT NULL REFERENCES sub_lessons(id) ON DELETE CASCADE,
  correct_count INTEGER NOT NULL,
  answered_count INTEGER NOT NULL,
  total_count INTEGER NOT NULL,
  stopped_early BOOLEAN NOT NULL DEFAULT FALSE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quiz_answers (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  selected_choice_id TEXT,
  correct BOOLEAN NOT NULL
);

CREATE INDEX IF NOT EXISTS categories_course_idx ON categories (course_id, position);
CREATE INDEX IF NOT EXISTS sub_categories_category_idx ON sub_categories (category_id, position);
CREATE INDEX IF NOT EXISTS lessons_sub_category_idx ON lessons (sub_category_id, position);
CREATE INDEX IF NOT EXISTS sub_lessons_lesson_idx ON sub_lessons (lesson_id, position);
CREATE INDEX IF NOT EXISTS bites_sub_lesson_idx ON bites (sub_lesson_id, position);
CREATE INDEX IF NOT EXISTS questions_bite_idx ON questions (bite_id, position);
CREATE INDEX IF NOT EXISTS bite_links_bite_idx ON bite_links (bite_id, position);
CREATE INDEX IF NOT EXISTS pin_attempts_profile_idx ON pin_attempts (profile_id, attempted_at);
CREATE INDEX IF NOT EXISTS pin_attempts_ip_idx ON pin_attempts (ip, attempted_at);
CREATE INDEX IF NOT EXISTS revisions_entity_idx ON content_revisions (entity_type, entity_id, created_at);
`;
