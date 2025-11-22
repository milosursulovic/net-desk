import mongoose from "mongoose";

const InventoryItemSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        "motherboard",
        "cpu",
        "ram",
        "hdd",
        "ssd",
        "psu",
        "gpu",
        "nic",
        "case",
        "other",
        "router",
        "switch",
        "access-point",
        "cable-network",
        "cable-power",
        "cable-hdmi",
        "connector-rj45",
        "tester-network",
        "keyboard",
        "mouse",
      ],
      required: true,
      index: true,
    },

    manufacturer: { type: String, trim: true },
    model: { type: String, trim: true, required: true },
    serialNumber: { type: String, trim: true },
    quantity: { type: Number, default: 1, min: 1 },

    capacity: { type: String, trim: true },
    speed: { type: String, trim: true },
    socket: { type: String, trim: true },

    location: { type: String, trim: true },
    notes: { type: String, trim: true },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("InventoryItem", InventoryItemSchema);
