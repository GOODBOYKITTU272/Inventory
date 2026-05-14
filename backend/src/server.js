import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import { authMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';

import productsRouter from './routes/products.js';
import inventoryRouter from './routes/inventory.js';
import transactionsRouter from './routes/transactions.js';
import reportsRouter from './routes/reports.js';

const app = express();
const PORT = process.env.PORT || 4000;

// ---- security & utility middleware
app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim());
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);            // server-to-server / curl
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  }),
);

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

// ---- public
app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// ---- protected
app.use('/api', authMiddleware);
app.use('/api/products', productsRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/reports', reportsRouter);

// ---- error handler — must be LAST
app.use(errorHandler);

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[applyways-api] listening on http://localhost:${PORT}`);
});
