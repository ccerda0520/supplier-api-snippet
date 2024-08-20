import { z, ZodError, ZodIssue } from 'zod';
import { Request } from 'express';
import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
// @ts-ignore declare type eventually;
import parseRequest from 'parse-request';
import { ERROR_SUBTYPES, ERROR_TYPES } from 'commons-ephesus/constants/error.constants';

export type ApiErrorObj = {
  type?: (typeof ERROR_TYPES)[keyof typeof ERROR_TYPES];
  message: string;
  subType?: ERROR_SUBTYPES;
  contextId?: string;
  status: HttpStatus;
};

export function getApiErrorObj(error: ApiError | Error, contextId?: string): ApiErrorObj[] {
  if (error instanceof BadRequestException) {
    const response = error.getResponse();
    // This is the TS Rest / Zod validation response
    if (response && typeof response !== 'string' && 'issues' in response) {
      return (response as ZodError).issues.map((issue) =>
        zodToApiErrorObj({
          ...issue,
        }),
      );
    }
  } else if (error instanceof ApiError) {
    const { statusCode, subType, message } = error;
    return [
      {
        subType: subType ?? null,
        contextId: contextId ?? null,
        message,
        status: statusCode,
        type: ERROR_TYPES[statusCode],
      },
    ];
  } else if (error instanceof ApiBatchError) {
    return error.issues.map((issue) => batchErrorToApiErrorObj(issue, error.statusCode));
  } else if (error instanceof z.ZodError) {
    return error.issues.map((issue) =>
      zodToApiErrorObj({
        ...issue,
      }),
    );
  }
  return [
    {
      contextId: contextId ?? null,
      message: error.message,
      status: 500 as const,
      subType: ERROR_SUBTYPES.SERVER_ERROR,
      type: ERROR_TYPES[500],
    },
  ];
}

export function zodToApiErrorObj({ path, message }: ZodIssue): ApiErrorObj {
  return {
    contextId: null,
    message: `${path.length ? `${path.join('.')}: ` : ''}${message}`,
    subType: ERROR_SUBTYPES.INVALID_ARGUMENT,
    type: ERROR_TYPES[400],
    status: 400 as const,
  };
}

export function batchErrorToApiErrorObj(
  { path, message }: ApiBatchIssue,
  status: keyof typeof ERROR_TYPES,
): ApiErrorObj {
  return {
    contextId: null,
    message: `${path ? `${path}: ` : ''}${message}`,
    subType: ERROR_SUBTYPES.INVALID_ARGUMENT,
    type: ERROR_TYPES[status],
    status: status,
  };
}

export function handleValidationError(error: unknown) {
  if (error instanceof z.ZodError) {
    return {
      status: 400 as const,
      body: {
        errors: error.issues.map((issue) =>
          zodToApiErrorObj({
            ...issue,
          }),
        ),
      },
    };
  }
  return {
    status: 400 as const,
    body: {
      errors: [
        getApiErrorObj(
          new ApiError({
            status: HttpStatus.BAD_REQUEST,
            message: 'Validation error',
            subType: ERROR_SUBTYPES.INVALID_ARGUMENT,
          }),
        ),
      ],
    },
  };
}

export function getRequestData(request: Request) {
  const { request: parsedRequest } = parseRequest({ req: request });
  if (parsedRequest.body) {
    try {
      parsedRequest.body = JSON.parse(parsedRequest.body);
    } catch (error) {
      // noop
    }
  }
  return parsedRequest;
}

export class ApiError extends HttpException {
  subType?: ERROR_SUBTYPES;

  statusCode?: keyof typeof ERROR_TYPES;

  constructor(
    options: {
      status: HttpStatus;
      message: string;
      subType?: ERROR_SUBTYPES;
    },
    error?: Error,
  ) {
    const errorCause = error ? { cause: error, description: error.message } : undefined;
    super(
      {
        status: options.status,
        error: options.message,
        message: options.message,
        trace: error?.stack,
      },
      options.status,
      errorCause,
    );
    this.subType = options.subType;
    this.statusCode = options.status;
  }
}

export type ApiBatchIssue = { path?: number; message: string };

export class ApiBatchError extends HttpException {
  statusCode?: keyof typeof ERROR_TYPES;
  issues: ApiBatchIssue[];

  constructor(
    options: {
      status: HttpStatus;
      message?: string;
      issues: ApiBatchIssue[];
    },
    error?: Error,
  ) {
    const errorCause = error ? { cause: error, description: error.message } : undefined;
    super(
      {
        status: options.status,
        error: options.message,
        message: options.message,
        trace: error?.stack,
      },
      options.status,
      errorCause,
    );
    this.issues = options.issues;
    this.statusCode = options.status;
  }
}
