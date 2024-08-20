import { Injectable } from '@nestjs/common';
import { v4 } from 'uuid';
import { LogLevel, sendGroupAndStreamLog } from 'commons-ephesus/utils/cloudWatch';

@Injectable()
export class LoggerService {
  async log(message: string, logLevel: LogLevel, stack = '') {
    const contextId = v4();

    return await sendGroupAndStreamLog({
      message: JSON.stringify({
        contextId,
        message,
        stack,
      }),
      logLevel: logLevel,
      logStreamName: 'supplier-api',
    });
  }
}
