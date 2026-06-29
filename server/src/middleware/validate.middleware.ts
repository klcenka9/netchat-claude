import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

// Validates req.body against a zod schema, replacing it with the parsed value.
export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: 'Validation failed', details: result.error.flatten() });
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({ error: 'Validation failed', details: result.error.flatten() });
      return;
    }
    // Express 4 query is read-only getter on some versions; attach parsed copy.
    (req as Request & { validatedQuery: unknown }).validatedQuery = result.data;
    next();
  };
}
