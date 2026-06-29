import rateLimit from 'express-rate-limit';

// Auth endpoints: 5 requests / minute / IP (spec §12).
export const authRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, slow down.' },
});

// Public webhook ingress: 5 / 10s per webhook (keyed by webhook id in the path).
export const webhookRateLimit = rateLimit({
  windowMs: 10 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.params.id ?? req.ip ?? 'unknown',
  message: { error: 'Webhook rate limit exceeded.' },
});
