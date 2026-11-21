import { friendlyError } from "./ai";

// Maps thrown errors to a user-safe JSON response.
export function route<A extends unknown[]>(handler: (...args: A) => Promise<Response>, fallback?: string) {
  return async (...args: A) => {
    try {
      return await handler(...args);
    } catch (err) {
      const message = friendlyError(err, fallback);
      console.error("[roleflow]", message);
      return Response.json({ error: message }, { status: 500 });
    }
  };
}

export const badRequest = (error: string, status = 400) => Response.json({ error }, { status });
