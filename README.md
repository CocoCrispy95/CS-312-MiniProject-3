# The Blog Space

A persistent blog application built with Node.js, Express, EJS, and PostgreSQL. Visitors can read the feed; registered users can create posts and edit or delete their own posts.

## Set up PostgreSQL

1. In pgAdmin, create a database named `blogdb` (or `BlogDB`).
2. Open the Query Tool for that database and run [`schema.sql`](./schema.sql). It creates the `users` and `blogs` tables and inserts three demo accounts and five sample posts. The seed statements are safe to run again.

Demo sign-ins:

| User ID | Password |
| --- | --- |
| `maya` | `MayaBlog2026!` |
| `jordan` | `JordanBlog2026!` |
| `alex` | `AlexBlog2026!` |

Passwords are stored as salted scrypt hashes, not plaintext.

## Run locally

Install dependencies and provide PostgreSQL connection values. By default the app connects to `localhost:5432`, database `blogdb`, and user `postgres`.

```bash
npm install
$env:PGPASSWORD="your-postgres-password"
$env:SESSION_SECRET="replace-this-with-a-long-random-secret"
npm start
```

For PostgreSQL installations with a different user, host, or database, set `PGUSER`, `PGHOST`, `PGPORT`, and `PGDATABASE`; alternatively, provide `DATABASE_URL`. The `SESSION_SECRET` fallback is for local development only and must be replaced in deployment. The app checks its PostgreSQL connection before it starts listening.

Open [http://localhost:3000](http://localhost:3000). For automatic restarts during development, run `npm run dev`.

## Routes and behavior

- `GET /` displays the database-backed feed and sign-in/post composer
- `GET /signup`, `POST /signup` create accounts (duplicate IDs are rejected)
- `GET /signin`, `POST /signin` authenticate users
- `POST /logout` signs out
- `POST /posts` creates a post for the signed-in user
- `GET /posts/:id/edit`, `POST /posts/:id` edit the signed-in user's post
- `POST /posts/:id/delete` deletes only the signed-in user's post
