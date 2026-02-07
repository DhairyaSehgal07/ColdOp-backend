import "colors";

/**
 * Logger utility with colored output
 */
export const logger = {
  info: (message: string) => {
    console.log(`[INFO] ${message}`.blue);
  },
  success: (message: string) => {
    console.log(`[SUCCESS] ${message}`.green);
  },
  warn: (message: string) => {
    console.log(`[WARN] ${message}`.yellow);
  },
  error: (message: string) => {
    console.log(`[ERROR] ${message}`.red);
  },
  debug: (message: string) => {
    console.log(`[DEBUG] ${message}`.gray);
  },
};

// Example usage:
// logger.info('Server starting...');
// logger.success('Database connected');
// logger.warn('This is a warning');
// logger.error('An error occurred');
// logger.debug('Debug information');
