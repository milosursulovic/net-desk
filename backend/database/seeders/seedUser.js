import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import User from "../../models/User.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

async function seedUser() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB");

    const existing = await User.findOne({ username: "admin" });
    if (existing) {
      console.log('User "admin" already exists. Exiting...');
      return process.exit(0);
    }

    const hashedPassword = await bcrypt.hash("password", 10);

    const user = new User({
      username: "admin",
      password: hashedPassword,
    });

    await user.save();
    console.log("Seed user created: admin / password");

    process.exit(0);
  } catch (err) {
    console.error("Error seeding user:", err);
    process.exit(1);
  }
}

seedUser();
