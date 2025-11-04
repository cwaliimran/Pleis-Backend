function extractEndpoints(content, baseRoute) {
  const endpoints = [];
  const routeRegex = /router\.(get|post|put|delete|patch)\s*\(([\s\S]*?)\);/g;

  let match;
  while ((match = routeRegex.exec(content))) {
    const method = match[1].toUpperCase();
    const args = match[2];
    const pathMatch = args.match(/["'`](.*?)["'`]/);
    const subRoute = pathMatch ? pathMatch[1] : "";

    // Extract handlers and middleware
    const rawArgs = args.split(",").map((a) => a.trim());
    let handler = null;

    // Inline arrow function calling controller
    const inlineCall = args.match(/([A-Za-z0-9_]+)\s*\(req\s*,\s*res/g);
    if (inlineCall) handler = inlineCall[1];

    // Last argument if multiple middlewares
    if (!handler && rawArgs.length > 1) {
      const last = rawArgs[rawArgs.length - 1];
      if (!last.includes("=>")) handler = last;
    }

    if (!handler && rawArgs.length === 1 && !rawArgs[0].startsWith('"'))
      handler = rawArgs[0];

    // Clean parentheses and known middlewares
    handler = handler ? handler.split("(")[0] : null;
    if (["auth", "roleMiddleware", "apiRateLimiter"].includes(handler))
      handler = null;

    endpoints.push({
      method,
      subRoute,
      handler,
      fullPath: `${baseRoute}${subRoute}`.replace(/\/+/g, "/"),
      controller: null,
    });
  }

  return endpoints;
}

module.exports = { extractEndpoints };
