const jwt = require('jsonwebtoken');

// استبدل النص التالي بالـ JWT Secret الذي نسخته من Supabase
const JWT_SECRET = 'F77fXNFnOlpY0KLMXdfVKWgL9dXFs6umgOvi4TpYOJkREsDPh7eGftayVFXW6pevRgXSH7uC1Z8X28EXHIoYgQ==';

const payload = {
  iss: "supabase",
  ref: "qrdasgkegudvnobjwafc",
  role: "anon",
  app_role: "smgroup_app",
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + (10 * 365 * 24 * 60 * 60)
};

console.log(jwt.sign(payload, JWT_SECRET));
