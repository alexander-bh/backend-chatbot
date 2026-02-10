const mongoose = require("mongoose");

/**
 * Ejecuta una función dentro de una transacción Mongo
 * con retry automático para errores transitorios.
 */
async function withTransactionRetry(fn, retries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      const result = await fn(session);

      await session.commitTransaction();

      return result;

    } catch (err) {
      lastError = err;

      try {
        await session.abortTransaction();
      } catch (_) {}

      // 🔁 Mongo espera retry en este caso
      if (
        err?.errorLabels?.includes("TransientTransactionError") &&
        attempt < retries
      ) {
        continue;
      }

      throw err;

    } finally {
      session.endSession();
    }
  }

  throw lastError;
}

module.exports = withTransactionRetry;
