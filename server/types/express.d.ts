import { Logger } from "winston";

declare global {
  namespace Express {
    interface Request {
      id?: string;
      logger?: Logger;
    }
  }
}
