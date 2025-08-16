import { Request, Response, NextFunction } from 'express'
import { ValidationError } from 'express-validator'
import { ErrorResponse } from './types'

interface AppError extends Error {
  statusCode?: number
  errors?: ValidationError[]
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error(err.stack)

  const statusCode = err.statusCode || 500
  const response: ErrorResponse = {
    error: err.message || 'Internal Server Error',
    ...(err.errors && { details: err.errors }),
  }

  res.status(statusCode).json(response)
}

export function notFoundHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  res.status(404).json({ error: 'Not Found' })
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next)
  }
}
