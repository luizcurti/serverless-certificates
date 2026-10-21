type LogFields = Record<string, unknown>;

const write = (level: 'info' | 'error', message: string, fields: LogFields) => {
  const line = JSON.stringify({ level, message, ...fields, timestamp: new Date().toISOString() });
  if (level === 'error') {
    console.error(line);
  } else {
    console.log(line);
  }
};

export const logInfo = (message: string, fields: LogFields = {}) => write('info', message, fields);

export const logError = (message: string, error: unknown, fields: LogFields = {}) =>
  write('error', message, {
    ...fields,
    error: error instanceof Error ? error.message : String(error),
  });
