import { createHash } from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import { RateLimitModel } from '../../database/models/RateLimit.model.js';
import { AppError } from '../errors/app-error.js';

export function rateLimit(bucket: string, max: number, windowMs: number, perUser = false) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const identity = perUser ? req.user?.userId : req.ip;
      if (!identity) throw AppError.unauthorized();
      const window = Math.floor(Date.now() / windowMs);
      const expiresAt = new Date((window + 1) * windowMs);
      const key = createHash('sha256').update(bucket + ':' + identity + ':' + window).digest('hex');
      const update = { $inc: { count: 1 }, $setOnInsert: { expiresAt } };
      let record;
      try { record = await RateLimitModel.findOneAndUpdate({ _id: key }, update, { upsert: true, new: true }); }
      catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
        record = await RateLimitModel.findOneAndUpdate({ _id: key }, { $inc: { count: 1 } }, { new: true });
      }
      if (!record || record.count > max) {
        res.setHeader('Retry-After', Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000)));
        throw new AppError(429, 'QUOTA_EXCEEDED', 'Request limit reached; try again later');
      }
      next();
    } catch (error) { next(error); }
  };
}
