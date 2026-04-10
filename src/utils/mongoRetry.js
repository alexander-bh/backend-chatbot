// src/utils/mongoRetry.js
const mongoRetryOperation = async (operation, maxRetries = 3, baseDelay = 150) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const isRetryable =
        error.code === 112 ||
        error.codeName === "WriteConflict" ||
        error.errorLabelSet?.has("TransientTransactionError") ||
        error.errorLabelSet?.has("UnknownTransactionCommitResult");

      if (isRetryable && attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1); // 150ms, 300ms, 600ms
        console.warn(`[MongoRetry] Intento ${attempt}/${maxRetries} fallido. Reintentando en ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
};

module.exports = { mongoRetryOperation };