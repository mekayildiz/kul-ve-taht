/**
 * Minimal, bagimliliksiz HTTP router. Worker ortam baglamini (env) handler'lara
 * gecirir; boylece D1/R2/DO binding'lerine erisim saglanir.
 */

export interface RouteContext<E = unknown> {
  request: Request;
  url: URL;
  params: Record<string, string>;
  env: E;
  ctx: ExecutionContext | undefined;
}

export type RouteHandler<E = unknown> = (context: RouteContext<E>) => Response | Promise<Response>;

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: RouteHandler<never>;
}

function compile(path: string): { pattern: RegExp; keys: string[] } {
  const keys: string[] = [];
  const pattern = path
    .split("/")
    .map((segment) => {
      if (segment.startsWith(":")) {
        keys.push(segment.slice(1));
        return "([^/]+)";
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  return { pattern: new RegExp(`^${pattern}/?$`), keys };
}

export class Router<E = unknown> {
  private routes: Route[] = [];

  add(method: string, path: string, handler: RouteHandler<E>): this {
    const { pattern, keys } = compile(path);
    this.routes.push({ method: method.toUpperCase(), pattern, keys, handler: handler as RouteHandler<never> });
    return this;
  }

  get(path: string, handler: RouteHandler<E>): this {
    return this.add("GET", path, handler);
  }

  post(path: string, handler: RouteHandler<E>): this {
    return this.add("POST", path, handler);
  }

  async handle(request: Request, env: E, ctx?: ExecutionContext): Promise<Response | null> {
    const url = new URL(request.url);
    for (const route of this.routes) {
      if (route.method !== request.method.toUpperCase()) continue;
      const match = route.pattern.exec(url.pathname);
      if (!match) continue;
      const params: Record<string, string> = {};
      route.keys.forEach((key, index) => {
        const value = match[index + 1];
        if (value !== undefined) params[key] = decodeURIComponent(value);
      });
      const handler = route.handler as unknown as RouteHandler<E>;
      return handler({ request, url, params, env, ctx });
    }
    return null;
  }
}
