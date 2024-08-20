import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter } from '@nestjs/common';
import { ApiError, ApiBatchError, getApiErrorObj, getRequestData } from '../functions/helpers/error.helpers';
import { Response } from 'express';
import { z } from 'zod';
import { v4 } from 'uuid';
import { LogLevel, sendGroupAndStreamLog } from 'commons-ephesus/utils/cloudWatch';

@Catch()
export class CatchAllExceptionFilter implements ExceptionFilter {
  async catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception?.getStatus?.() ?? 500;
    const contextId = v4();
    const nonContextErrorTypes = [400, 401, 429];
    if (!nonContextErrorTypes.includes(status)) {
      const request = ctx.getRequest();
      await sendGroupAndStreamLog({
        message: JSON.stringify({
          contextId,
          message: exception.message,
          status,
          exception,
          stack: exception.stack,
          request: getRequestData(request),
        }),
        logLevel: LogLevel.ERROR,
        logStreamName: 'supplier-api',
      });
    }

    if (
      exception instanceof BadRequestException ||
      exception instanceof ApiError ||
      exception instanceof ApiBatchError ||
      exception instanceof z.ZodError
    ) {
      const errorObjects = getApiErrorObj(exception, contextId);
      return response.status(errorObjects[0].status).json({
        errors: errorObjects,
      });
    }

    return response.status(status).json({
      errors: [
        {
          subType: null,
          contextId: nonContextErrorTypes.includes(status) ? null : contextId,
          message:
            status === 500 ? 'Something went wrong on our end. Provide this contextId to support.' : exception.message,
          status,
        },
      ],
    });
  }
}
