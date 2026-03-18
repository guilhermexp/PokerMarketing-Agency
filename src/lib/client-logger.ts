type ClientLogMethod = (...args: unknown[]) => void;

const noop: ClientLogMethod = () => {};

export const clientLogger = {
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
};
