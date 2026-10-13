-- Create the BlogDB database in pgAdmin, connect to it, then run this file.

CREATE TABLE IF NOT EXISTS users (
  user_id VARCHAR(255) PRIMARY KEY,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS blogs (
  blog_id SERIAL PRIMARY KEY,
  creator_name VARCHAR(255) NOT NULL,
  creator_user_id VARCHAR(255) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  date_created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users (user_id, password, name) VALUES
  ('maya', 'scrypt$2dad3a505a856c4934d682da8b26a2bd$7a0f587397d38c3ac41a062fdc8e6f20199a4b396f2d8f5d16cef4629e4810797606f7e3aa2cfc6893d68f67aeb23bfc40a3f6c151f600cf41902118391b2650', 'Maya Chen'),
  ('jordan', 'scrypt$787f7906a1cf0ef4eb2331cb5f86fdeb$707fe3780f11a47d5eab4a1d9047559ffb9ff0f663d8d25177d4092e5d6c1ad38934d476c6914684b875e6ba496a5666c3cfe247635161e278a72692b4d571d4', 'Jordan Ellis'),
  ('alex', 'scrypt$bfb2c2ac7f6837c1025b4113e7899066$3c832b64d9132cc924e5196a234beb3ab4f9f3fc5644ac54511e2d148df1cc4da28ba1750833a086f87b74cd2b3626d5b62221f6b4c58acf37fa17e2ff0b6b99', 'Alex Morgan')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO blogs (creator_name, creator_user_id, title, body, date_created)
SELECT seed.creator_name, seed.creator_user_id, seed.title, seed.body, seed.date_created
FROM (VALUES
  ('Maya Chen', 'maya', 'The joy of a slower morning', 'A good day does not need to start at full speed. I have been making room for a quiet cup of tea, a page of notes, and one small intention before opening my inbox.', TIMESTAMP '2026-09-08 08:30:00'),
  ('Jordan Ellis', 'jordan', 'Notes from the neighborhood walk', 'The corner bakery changed its window display again. Small details like that make a familiar route feel new, especially when you give yourself permission to look up.', TIMESTAMP '2026-09-10 17:15:00'),
  ('Alex Morgan', 'alex', 'A small guide to noticing', 'Take a different route home, leave your headphones in your bag, and give your attention to one ordinary thing. It is surprising how much a day can hold when you look closely.', TIMESTAMP '2026-09-12 12:00:00'),
  ('Maya Chen', 'maya', 'What the garden taught me', 'Not everything needs to happen on a schedule. The herbs that flourished this season were the ones I gave steady care, patience, and enough room to grow.', TIMESTAMP '2026-09-14 09:45:00'),
  ('Jordan Ellis', 'jordan', 'Keep a notebook nearby', 'An idea rarely arrives fully formed. I have started writing down the fragments: a phrase from the bus, a question after dinner, a color I want to remember.', TIMESTAMP '2026-09-16 18:20:00')
) AS seed(creator_name, creator_user_id, title, body, date_created)
WHERE NOT EXISTS (
  SELECT 1
  FROM blogs existing
  WHERE existing.creator_user_id = seed.creator_user_id
    AND existing.title = seed.title
);
