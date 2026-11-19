import type { ApiError } from './api'

/** `ApiError.code` of a rejected SDK call, `undefined` for network failures and non-contract answers. */
export const errorCode = (error: unknown) => (error as Partial<ApiError> | undefined)?.code

/** Alert title for a failed form submission that has no field-specific answer. */
export const submitFailureMessage = (error: unknown) =>
  errorCode(error) === 'VALIDATION_ERROR' ? 'Проверьте поля и попробуйте ещё раз' : 'Не удалось отправить. Попробуйте ещё раз.'
