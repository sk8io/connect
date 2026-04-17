export interface InitializeSK8MiddlewareOptions {
    apiKey: string;
    baseUrl?: string;
  }
  
  export type NextFunction = (error?: unknown) => void;
  
  export function initializeSK8Middleware(
    options: InitializeSK8MiddlewareOptions,
  ): (
    req: any,
    res: any,
    next?: NextFunction,
  ) => Promise<void>;
  