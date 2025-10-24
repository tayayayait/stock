const isViteEnv = typeof import.meta !== 'undefined' && typeof import.meta.env !== 'undefined';

export const getEnvVar = (key: string): string | undefined => {
  if (isViteEnv) {
    const value = import.meta.env[key];
    if (typeof value === 'string') {
      return value;
    }
  }

  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }

  return undefined;
};

export const getRequiredEnvVar = (key: string): string => {
  const value = getEnvVar(key);
  if (!value) {
    throw new Error(`Environment variable ${key} is required but was not provided.`);
  }
  return value;
};
