const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');
const { Pool } = require('pg');
const session = require('express-session');

const app = express();
const port = process.env.PORT || 3000;
const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
      host: process.env.PGHOST || 'localhost',
      port: Number(process.env.PGPORT) || 5432,
      database: process.env.PGDATABASE || 'blogdb',
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD,
    },
);
const scrypt = promisify(crypto.scrypt);
const sessionSecret = process.env.SESSION_SECRET || 'mini-project-development-session-secret';

if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET must be set when NODE_ENV is production.');
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}));

app.locals.formatDate = (date) => new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
}).format(date);

function cleanInput(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parsePostId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  return scrypt(password, salt, 64).then((hash) =>
    `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`);
}

async function verifyPassword(password, storedHash) {
  const [algorithm, saltHex, hashHex] = storedHash.split('$');
  if (algorithm !== 'scrypt' || !saltHex || !hashHex) {
    return false;
  }

  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

async function getPosts() {
  const { rows } = await pool.query(`
    SELECT blog_id, creator_name, creator_user_id, title, body, date_created
    FROM blogs
    ORDER BY date_created DESC, blog_id DESC
  `);
  return rows.map((row) => ({
    id: row.blog_id,
    author: row.creator_name,
    creatorUserId: row.creator_user_id,
    title: row.title,
    content: row.body,
    createdAt: row.date_created,
  }));
}

async function getPost(id) {
  const { rows } = await pool.query(`
    SELECT blog_id, creator_name, creator_user_id, title, body, date_created
    FROM blogs
    WHERE blog_id = $1
  `, [id]);
  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    id: row.blog_id,
    author: row.creator_name,
    creatorUserId: row.creator_user_id,
    title: row.title,
    content: row.body,
    createdAt: row.date_created,
  };
}

function requireSignIn(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/signin');
  }
  return next();
}

app.get('/', async (req, res) => {
  res.render('index', {
    posts: await getPosts(),
    currentUser: req.session.user || null,
    error: null,
    draft: null,
  });
});

app.get('/signup', (req, res) => {
  res.render('signup', { error: null, draft: {} });
});

app.post('/signup', async (req, res) => {
  const userId = cleanInput(req.body.user_id);
  const name = cleanInput(req.body.name);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const draft = { userId, name };

  if (!userId || !name || !password) {
    return res.status(400).render('signup', {
      error: 'Please complete your user ID, name, and password.',
      draft,
    });
  }
  if (userId.length > 255 || name.length > 255 || password.length < 8 || password.length > 128) {
    return res.status(400).render('signup', {
      error: 'Use a user ID and name up to 255 characters and a password between 8 and 128 characters.',
      draft,
    });
  }

  const existingUser = await pool.query(
    'SELECT user_id FROM users WHERE user_id = $1',
    [userId],
  );
  if (existingUser.rowCount > 0) {
    return res.status(409).render('signup', {
      error: 'That user ID is already taken. Please choose another one.',
      draft,
    });
  }

  try {
    await pool.query(
      'INSERT INTO users (user_id, password, name) VALUES ($1, $2, $3)',
      [userId, await hashPassword(password), name],
    );
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).render('signup', {
        error: 'That user ID is already taken. Please choose another one.',
        draft,
      });
    }
    throw error;
  }

  return res.redirect('/signin?registered=1');
});

app.get('/signin', (req, res) => {
  res.render('signin', {
    error: req.query.registered ? 'Your account is ready. Please sign in.' : null,
    draft: {},
  });
});

app.post('/signin', async (req, res, next) => {
  const userId = cleanInput(req.body.user_id);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const { rows } = await pool.query(
    'SELECT user_id, password, name FROM users WHERE user_id = $1',
    [userId],
  );
  const user = rows[0];

  if (!user || !(await verifyPassword(password, user.password))) {
    return res.status(401).render('signin', {
      error: 'The user ID or password is incorrect. Please try again.',
      draft: { userId },
    });
  }

  req.session.regenerate((error) => {
    if (error) {
      return next(error);
    }
    req.session.user = { userId: user.user_id, name: user.name };
    return req.session.save((saveError) => {
      if (saveError) {
        return next(saveError);
      }
      return res.redirect('/');
    });
  });
});

app.post('/logout', (req, res, next) => {
  req.session.destroy((error) => {
    if (error) {
      return next(error);
    }
    res.clearCookie('connect.sid');
    return res.redirect('/');
  });
});

app.post('/posts', requireSignIn, async (req, res) => {
  const title = cleanInput(req.body.title);
  const content = cleanInput(req.body.content);

  if (!title || !content || title.length > 255 || content.length > 4000) {
    return res.status(400).render('index', {
      posts: await getPosts(),
      currentUser: req.session.user,
      error: 'Please provide a title (up to 255 characters) and post (up to 4,000 characters).',
      draft: { title, content },
    });
  }

  await pool.query(
    'INSERT INTO blogs (creator_name, creator_user_id, title, body) VALUES ($1, $2, $3, $4)',
    [req.session.user.name, req.session.user.userId, title, content],
  );
  return res.redirect('/');
});

app.get('/posts/:id/edit', requireSignIn, async (req, res) => {
  const id = parsePostId(req.params.id);
  const post = id === null ? null : await getPost(id);

  if (!post || post.creatorUserId !== req.session.user.userId) {
    return res.status(404).render('404');
  }
  return res.render('edit', { post, currentUser: req.session.user });
});

app.post('/posts/:id', requireSignIn, async (req, res) => {
  const id = parsePostId(req.params.id);
  const post = id === null ? null : await getPost(id);

  if (!post || post.creatorUserId !== req.session.user.userId) {
    return res.status(404).render('404');
  }

  const title = cleanInput(req.body.title);
  const content = cleanInput(req.body.content);
  if (!title || !content || title.length > 255 || content.length > 4000) {
    return res.status(400).render('edit', {
      post: { ...post, title, content },
      currentUser: req.session.user,
      error: 'Please provide a title (up to 255 characters) and post (up to 4,000 characters).',
    });
  }

  await pool.query(
    'UPDATE blogs SET title = $1, body = $2 WHERE blog_id = $3 AND creator_user_id = $4',
    [title, content, post.id, req.session.user.userId],
  );
  return res.redirect('/');
});

app.post('/posts/:id/delete', requireSignIn, async (req, res) => {
  const id = parsePostId(req.params.id);
  if (id === null) {
    return res.status(404).render('404');
  }
  const result = await pool.query(
    'DELETE FROM blogs WHERE blog_id = $1 AND creator_user_id = $2',
    [id, req.session.user.userId],
  );
  if (result.rowCount === 0) {
    return res.status(404).render('404');
  }
  return res.redirect('/');
});

app.use((req, res) => res.status(404).render('404'));
app.use((error, req, res, next) => {
  console.error('Request failed:', error);
  if (res.headersSent) {
    return next(error);
  }
  return res.status(500).send('Something went wrong. Please try again later.');
});

async function start() {
  await pool.query('SELECT 1');
  if (!process.env.SESSION_SECRET) {
    console.warn('SESSION_SECRET is not set; using the development-only session secret.');
  }
  app.listen(port, () => {
    console.log(`The Blog Space is running at http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error('Unable to connect to PostgreSQL. Check the database settings and schema:', error);
  process.exitCode = 1;
});
