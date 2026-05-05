import mongoose from "mongoose";

function isUnsupportedTransactionError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("transaction numbers are only allowed") ||
    message.includes("replica set") ||
    message.includes("does not support retryable writes")
  );
}

export async function runWithOptionalTransaction<T>(
  work: (session: mongoose.ClientSession | null) => Promise<T>,
) {
  const session = await mongoose.startSession();

  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } catch (error) {
    if (!isUnsupportedTransactionError(error)) {
      throw error;
    }
    return work(null);
  } finally {
    await session.endSession();
  }
}
