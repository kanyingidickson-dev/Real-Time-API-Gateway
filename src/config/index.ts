import { z } from 'zod';

export type UpstreamsConfig = Record<string, string[]>;

export type Config = {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  authRequired: boolean;
  jwtSecret?: string;
  rateLimit: {
    max: number;
    windowMs: number;
  };
  httpProxyTimeoutMs: number;
  cache: {
    enabled: boolean;
    defaultTtlMs: number;
    maxBodyBytes: number;
  };
  underPressure: {
    maxEventLoopDelayMs: number;
    maxHeapUsedBytes?: number;
    maxRssBytes?: number;
  };
  upstreams: UpstreamsConfig;
  websocket: {
    maxBufferedBytes: number;
    pingIntervalMs: number;
  };
};

const upstreamsSchema = z.record(z.string(), z.array(z.string().url()).min(1));

const envBool = z.preprocess((value) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;

  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(v)) return true;
    if (['false', '0', 'no', 'n', 'off'].includes(v)) return false;
  }

  return value;
}, z.boolean());

const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  AUTH_REQUIRED: envBool.optional(),
  JWT_SECRET: z.string().min(32).optional(),

  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(200),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),

  HTTP_PROXY_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),

  CACHE_ENABLED: envBool.default(false),
  CACHE_DEFAULT_TTL_MS: z.coerce.number().int().positive().default(5_000),
  CACHE_MAX_BODY_BYTES: z.coerce.number().int().positive().default(262_144),

  UNDER_PRESSURE_MAX_EVENT_LOOP_DELAY_MS: z.coerce.number().int().positive().default(1_000),
  UNDER_PRESSURE_MAX_HEAP_USED_BYTES: z.coerce.number().int().positive().optional(),
  UNDER_PRESSURE_MAX_RSS_BYTES: z.coerce.number().int().positive().optional(),

  WS_MAX_BUFFERED_BYTES: z.coerce.number().int().positive().default(2_000_000),
  WS_PING_INTERVAL_MS: z.coerce.number().int().positive().default(30_000),

  UPSTREAMS: z.string().default('{}')
});

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = baseEnvSchema.parse(env);

  const authRequired = parsed.AUTH_REQUIRED ?? parsed.NODE_ENV === 'production';
  if (authRequired && !parsed.JWT_SECRET) {
    throw new Error('JWT_SECRET is required when AUTH_REQUIRED is true');
  }

  let upstreamsJson: unknown;
  try {
    upstreamsJson = JSON.parse(parsed.UPSTREAMS);
  } catch {
    throw new Error('UPSTREAMS must be valid JSON');
  }

  const upstreams = upstreamsSchema.parse(upstreamsJson);

  return {
    nodeEnv: parsed.NODE_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
    authRequired,
    jwtSecret: parsed.JWT_SECRET,
    rateLimit: {
      max: parsed.RATE_LIMIT_MAX,
      windowMs: parsed.RATE_LIMIT_WINDOW_MS
    },
    httpProxyTimeoutMs: parsed.HTTP_PROXY_TIMEOUT_MS,
    cache: {
      enabled: parsed.CACHE_ENABLED,
      defaultTtlMs: parsed.CACHE_DEFAULT_TTL_MS,
      maxBodyBytes: parsed.CACHE_MAX_BODY_BYTES
    },
    underPressure: {
      maxEventLoopDelayMs: parsed.UNDER_PRESSURE_MAX_EVENT_LOOP_DELAY_MS,
      maxHeapUsedBytes: parsed.UNDER_PRESSURE_MAX_HEAP_USED_BYTES,
      maxRssBytes: parsed.UNDER_PRESSURE_MAX_RSS_BYTES
    },
    upstreams,
    websocket: {
      maxBufferedBytes: parsed.WS_MAX_BUFFERED_BYTES,
      pingIntervalMs: parsed.WS_PING_INTERVAL_MS
    }
  };
}
