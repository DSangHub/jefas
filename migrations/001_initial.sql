CREATE TABLE users (
 id uuid PRIMARY KEY, email text NOT NULL UNIQUE, salt text NOT NULL, password_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE profiles (
 user_id uuid PRIMARY KEY REFERENCES users ON DELETE CASCADE, name text NOT NULL,
 language text NOT NULL DEFAULT 'es-MX', voice boolean NOT NULL DEFAULT true,
 provider text NOT NULL DEFAULT 'openai' CHECK(provider IN ('openai','gemini','anthropic'))
);
CREATE TABLE sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE auth_attempts (key text PRIMARY KEY, attempts integer NOT NULL DEFAULT 1, expires_at timestamptz NOT NULL);
CREATE TABLE schools (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 160), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX schools_owner ON schools(user_id);
CREATE TABLE friendships (
 id uuid PRIMARY KEY, requester_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 recipient_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected')),
 created_at timestamptz NOT NULL DEFAULT now(), CHECK(requester_id <> recipient_id)
);
CREATE UNIQUE INDEX friendships_pair ON friendships(least(requester_id,recipient_id),greatest(requester_id,recipient_id));
CREATE TABLE chats (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 friend_id uuid REFERENCES users ON DELETE CASCADE, title text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(friend_id IS NULL OR friend_id <> user_id)
);
CREATE INDEX chats_owner ON chats(user_id);
CREATE INDEX chats_friend ON chats(friend_id);
CREATE TABLE messages (
 id uuid PRIMARY KEY, chat_id uuid NOT NULL REFERENCES chats ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 role text NOT NULL CHECK(role IN ('user','assistant')), content text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_chat ON messages(chat_id,created_at,id);
CREATE TABLE approvals (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE, request text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','approved','rejected','failed')),
 result jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX approvals_owner ON approvals(user_id,status);
CREATE TABLE ai_generations (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('chat','photo')), era text, model text NOT NULL,
 status text NOT NULL CHECK(status IN ('pending','completed','failed')),
 input jsonb NOT NULL, output jsonb, error text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX generations_owner ON ai_generations(user_id,created_at);
