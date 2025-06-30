import mongoose from "mongoose";

const migrationSchema = new mongoose.Schema({
  name: { type: String, unique: true },
  createdAt: { type: Date, default: Date.now },
});

const Migration = mongoose.model("Migration", migrationSchema);
export default Migration;
