// models/ComputerMetadata.js
import mongoose from "mongoose";

/** Parse WMI "/Date(…)/", ISO string or number (ms) into Date */
const parseWmiOrIso = (val) => {
  if (val == null || val === "") return val;
  if (val instanceof Date) return val;
  if (typeof val === "number") return new Date(val);
  if (typeof val === "string") {
    const m = val.match(/\/Date\((\d+)\)\//);
    if (m) return new Date(Number(m[1]));
    const d = new Date(val);
    if (!isNaN(d)) return d;
  }
  return null;
};

// Helper: accept single object or array; null/undefined -> []
const toArray = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

const osSchema = new mongoose.Schema(
  {
    Caption: String,
    Version: String,
    Build: String,
    InstallDate: { type: Date, set: parseWmiOrIso },
  },
  { _id: false }
);

const systemSchema = new mongoose.Schema(
  {
    Manufacturer: String,
    Model: String,
    TotalRAM_GB: Number,
  },
  { _id: false }
);

const motherboardSchema = new mongoose.Schema(
  {
    Manufacturer: String,
    Product: String,
    Serial: String,
  },
  { _id: false }
);

const biosSchema = new mongoose.Schema(
  {
    Vendor: String,
    Version: String,
    ReleaseDate: { type: Date, set: parseWmiOrIso },
  },
  { _id: false }
);

const cpuSchema = new mongoose.Schema(
  {
    Name: String,
    Cores: Number,
    LogicalCPUs: Number,
    MaxClockMHz: Number,
    Socket: String,
  },
  { _id: false }
);

const ramModuleSchema = new mongoose.Schema(
  {
    Slot: String,
    Manufacturer: String,
    PartNumber: String,
    Serial: String,
    CapacityGB: Number,
    SpeedMTps: Number,
    // changed to String so values like "DIMM" don't cause cast errors
    FormFactor: String,
  },
  { _id: false }
);

const storageSchema = new mongoose.Schema(
  {
    Model: String,
    Serial: String,
    Firmware: String,
    SizeGB: Number,
    MediaType: String, // e.g., HDD/SSD
    BusType: String, // e.g., SATA/NVMe/USB
    DeviceID: String,
  },
  { _id: false }
);

const gpuSchema = new mongoose.Schema(
  {
    Name: String,
    DriverVers: String,
    VRAM_GB: Number,
  },
  { _id: false }
);

const nicSchema = new mongoose.Schema(
  {
    Name: String,
    MAC: String,
    SpeedMbps: Number,
  },
  { _id: false }
);

const computerMetadataSchema = new mongoose.Schema(
  {
    // 1-1 veza (unikat)
    ipEntry: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "IpEntry",
      required: true,
      unique: true,
      index: true,
    },

    CollectedAt: { type: Date, set: parseWmiOrIso },
    ComputerName: { type: String, index: true },
    UserName: String,

    OS: osSchema,
    System: systemSchema,
    Motherboard: motherboardSchema,
    BIOS: biosSchema,
    CPU: cpuSchema,

    // Lists with coercion (accept single object or array)
    RAMModules: { type: [ramModuleSchema], set: toArray },
    Storage: { type: [storageSchema], set: toArray },
    GPUs: { type: [gpuSchema], set: toArray },
    NICs: { type: [nicSchema], set: toArray },

    PSU: String,
  },
  { timestamps: true }
);

const ComputerMetadata = mongoose.model(
  "ComputerMetadata",
  computerMetadataSchema
);

export default ComputerMetadata;
