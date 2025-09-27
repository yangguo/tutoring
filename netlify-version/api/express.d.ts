
import { JWTPayload } from './utils/jwt';

declare global {
  namespace Express {
    export interface Request {
      user?: JWTPayload;
    }
  }
}
