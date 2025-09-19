import mongoose from "mongoose";

const domainSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    ipEntry: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "IpEntry",
      required: true,
      index: true,
    },
    timestamp: { type: Date, default: Date.now, index: true },
    category: {
      type: String,
      enum: ["normal", "blocked"],
      default: "normal",
      index: true,
    },
  },
  { versionKey: false }
);

domainSchema.index({ category: 1, timestamp: -1 });

export default mongoose.model("Domain", domainSchema);
