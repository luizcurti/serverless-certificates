import { logInfo, logError } from '../../src/utils/logger';

describe('logger', () => {
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  describe('logInfo', () => {
    it('logs an info line with the given fields', () => {
      logInfo('Something happened', { id: 'abc123' });

      expect(logSpy).toHaveBeenCalledTimes(1);
      const line = JSON.parse(logSpy.mock.calls[0][0]);
      expect(line).toMatchObject({ level: 'info', message: 'Something happened', id: 'abc123' });
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('defaults fields to an empty object when omitted', () => {
      logInfo('No fields here');

      expect(logSpy).toHaveBeenCalledTimes(1);
      const line = JSON.parse(logSpy.mock.calls[0][0]);
      expect(line).toMatchObject({ level: 'info', message: 'No fields here' });
    });
  });

  describe('logError', () => {
    it('logs an error line with the message from an Error instance', () => {
      logError('Failed to do the thing', new Error('boom'), { id: 'abc123' });

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const line = JSON.parse(errorSpy.mock.calls[0][0]);
      expect(line).toMatchObject({
        level: 'error',
        message: 'Failed to do the thing',
        error: 'boom',
        id: 'abc123',
      });
      expect(logSpy).not.toHaveBeenCalled();
    });

    it('stringifies non-Error values', () => {
      logError('Failed to do the thing', 'plain string error');

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const line = JSON.parse(errorSpy.mock.calls[0][0]);
      expect(line).toMatchObject({
        level: 'error',
        message: 'Failed to do the thing',
        error: 'plain string error',
      });
    });

    it('defaults fields to an empty object when omitted', () => {
      logError('No fields here', new Error('boom'));

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const line = JSON.parse(errorSpy.mock.calls[0][0]);
      expect(line).toMatchObject({ level: 'error', message: 'No fields here', error: 'boom' });
    });
  });
});
