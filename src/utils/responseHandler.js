const success = (res, status = 200, data = {}, message = 'Operación exitosa') => {
  return res.status(status).json({
    message,
    ...data,
  });
};

const error = (res, status = 500, message = 'Error interno del servidor', errorDetails = null) => {
  const response = { message };
  if (errorDetails) {
    response.error = errorDetails.message || errorDetails;
  }
  return res.status(status).json(response);
};

module.exports = {
  success,
  error,
};
