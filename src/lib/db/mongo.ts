import mongoose from "mongoose";

type Cached = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

const globalWithMongoose = globalThis as typeof globalThis & {
  _mongooseCache?: Cached;
};

const cached: Cached =
  globalWithMongoose._mongooseCache ?? { conn: null, promise: null };

if (!globalWithMongoose._mongooseCache) {
  globalWithMongoose._mongooseCache = cached;
}

export async function connectMongo(): Promise<typeof mongoose> {
  if (cached.conn) return cached.conn;

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is not defined. Copy .env.example to .env.local.");
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(mongoUri, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 5000,
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}
