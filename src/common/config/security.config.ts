export const securityConfig = {
  helmet: {
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false,
  },

  rateLimit: {
    ttl: 60000,
    limit: 120,
  },

  cors: {
    credentials: true,
  },
};
