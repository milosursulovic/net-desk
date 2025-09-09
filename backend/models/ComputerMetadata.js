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

// NEW: normalizacija CPU polja – prihvata objekat ili niz objekata
const normalizeCpu = (v) => {
  if (v == null) return v;
  const arr = Array.isArray(v) ? v : [v];

  const names = [];
  let coresSum = 0;
  let logicalSum = 0;
  let maxClock = 0;
  const sockets = [];

  for (const it of arr) {
    if (!it || typeof it !== "object") continue;
    const name = it.Name ?? it.name;
    if (name && !names.includes(String(name))) names.push(String(name));

    const cores = Number(it.Cores ?? it.NumberOfCores ?? 0);
    if (Number.isFinite(cores)) coresSum += cores;

    const logical = Number(it.LogicalCPUs ?? it.NumberOfLogicalProcessors ?? 0);
    if (Number.isFinite(logical)) logicalSum += logical;

    const clk = Number(it.MaxClockMHz ?? it.MaxClockSpeed ?? 0);
    if (Number.isFinite(clk)) maxClock = Math.max(maxClock, clk);

    const socket = it.Socket ?? it.SocketDesignation;
    if (socket) sockets.push(String(socket));
  }

  return {
    Name: names.length ? names.join(" + ") : undefined,
    Cores: coresSum || undefined,
    LogicalCPUs: logicalSum || undefined,
    MaxClockMHz: maxClock || undefined,
    Socket: sockets.length ? [...new Set(sockets)].join(", ") : undefined,
  };
};

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
    FormFactor: String, // ostavljeno kao String
  },
  { _id: false }
);

const storageSchema = new mongoose.Schema(
  {
    Model: String,
    Serial: String,
    Firmware: String,
    SizeGB: Number,
    MediaType: String,
    BusType: String,
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

    // KLJUČNO: primeni normalizaciju pri setovanju CPU polja
    CPU: { type: cpuSchema, set: normalizeCpu },

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
