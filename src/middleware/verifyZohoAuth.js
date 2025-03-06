const verifyZohoAuth = (req, res, next) => {
  const accessToken = req.headers.authorization;

  if (!accessToken) {
      return res.status(401).json({ error: "Unauthorized: No token provided" });
  }

  next();
};

module.exports = verifyZohoAuth;
