import pino from 'pino';

export const logger = pino({
  level: 'info',
//   transport: {
//     target: 'pino-pretty', // For human-readable output during development
//     options: {
//       colorize: true,
//       ignore: 'pid,hostname', // Remove unnecessary fields
//     },
//   },
});