const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error
  console.error(err);

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Resource not found';
    error = { message, statusCode: 404 };
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const message = 'Duplicate field value entered';
    error = { message, statusCode: 400 };
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message);
    error = { message, statusCode: 400 };
  }

  // CORS error
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      message: 'CORS:Origin not allowed',
      origin: req.headers.origin
    });
  }

  // Network error (502 Bad Gateway)
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.status === 502) {
    return res.status(502).json({
      success: false,
      message: 'Service temporarily unavailable. Please try again later.',
      error: 'Bad Gateway'
    });
  }

  // Axios error
  if (err.isAxiosError) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      return res.status(520).json({
        success: false,
        message: 'Unable to connect to external service. Please try again later.',
        error: 'Connection Error'
      });
    }
    
    if (err.response?.status === 520) {
      return res.status(520).json({
        success: false,
        message: 'External service temporarily unavailable. Please try again later.',
        error: 'Bad Gateway'
      });
    }
  }

  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = { errorHandler };