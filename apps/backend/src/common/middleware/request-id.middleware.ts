import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const supplied = req.get('x-request-id');
  const reqId = supplied && /^[a-zA-Z0-9_-]{1,100}$/.test(supplied) ? supplied : uuidv4();
  req.id = reqId;
  res.setHeader('x-request-id', reqId);
  next();
}

