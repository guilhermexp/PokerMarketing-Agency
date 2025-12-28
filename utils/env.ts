type EnvLike = Record<string, string | undefined>;

const readMetaEnv = (): EnvLike | undefined => {
  try {
    const meta = import.meta as unknown as { env?: EnvLike };
    return meta?.env;
  } catch {
    return undefined;
  }
};

export const getEnv = (key: string): string | undefined => {
  const metaEnv = readMetaEnv();
  if (metaEnv && key in metaEnv) return metaEnv[key];
  if (typeof process !== "undefined" && process.env) return process.env[key];
  return undefined;
};
