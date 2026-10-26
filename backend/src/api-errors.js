export function clientError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function errorResponse(error) {
  const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 500
    ? error.status : 500;
  return {
    status,
    error: status === 500 ? 'An unexpected server error occurred. Try again later.' : error.message,
  };
}
