import dns from "dns";
import mongoose from "mongoose";

// Use Google and Cloudflare public DNS servers to resolve MongoDB Atlas SRV records reliably and prevent querySrv ETIMEOUT
try {
  dns.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]);
} catch (dnsErr) {
  console.warn("Could not set custom DNS servers:", dnsErr.message);
}

const connectDB = async (retryCount = 0) => {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error("MONGODB_URI is not defined in environment");
    }

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 15000,
    });
    console.log("Database connected successfully");
  } catch (error) {
    console.error("MongoDB connection error:", error.message);

    if (retryCount < 3) {
      console.log(`Retrying MongoDB connection (${retryCount + 1}/3) in 2 seconds...`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return connectDB(retryCount + 1);
    }

    console.error("Fatal: Could not connect to MongoDB after 3 attempts. Please verify network and MONGODB_URI.");
  }
};

export default connectDB;