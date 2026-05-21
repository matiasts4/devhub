function isDevelopmentRuntime() {
  return process.env.NODE_ENV !== 'production';
}

module.exports = {
  isDevelopmentRuntime,
};
