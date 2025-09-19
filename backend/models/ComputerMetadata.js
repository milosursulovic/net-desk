import mongoose from "mongoose";

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

const toArray = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

const joinPlus = (v) => {
  if (v == null || v === "") return v;
  if (Array.isArray(v)) return [...new Set(v.map(String))].join(" + ");
  return String(v);
};
const joinComma = (v) => {
  if (v == null || v === "") return v;
  if (Array.isArray(v)) return [...new Set(v.map(String))].join(", ");
  return String(v);
};
const toNum = (v) => {
  if (v == null || v === "") return v;
  if (Array.isArray(v)) v = v[0];
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

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

  const out = {
    Name: names.length ? names.join(" + ") : undefined,
    Cores: coresSum || undefined,
    LogicalCPUs: logicalSum || undefined,
    MaxClockMHz: maxClock || undefined,
    Socket: sockets.length ? [...new Set(sockets)].join(", ") : undefined,
  };
  Object.keys(out).forEach((k) => out[k] === undefined && delete out[k]);
  return out;
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
    Name: { type: String, set: joinPlus },
    Cores: { type: Number, set: toNum },
    LogicalCPUs: { type: Number, set: toNum },
    MaxClockMHz: { type: Number, set: toNum },
    Socket: { type: String, set: joinComma },
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

    CollectedAt: { type: Date, set: parseWmiOrIso, index: true },
    ComputerName: { type: String, index: true },
    UserName: String,

    OS: osSchema,
    System: systemSchema,
    Motherboard: motherboardSchema,
    BIOS: biosSchema,

    CPU: { type: cpuSchema, set: normalizeCpu },

    RAMModules: { type: [ramModuleSchema], set: toArray },
    Storage: { type: [storageSchema], set: toArray },
    GPUs: { type: [gpuSchema], set: toArray },
    NICs: { type: [nicSchema], set: toArray },

    PSU: String,
  },
  { timestamps: true }
);

function fixCpuShapeInUpdate(update) {
  if (!update || typeof update !== "object") return;

  const touch = (obj) => {
    if (!obj || typeof obj !== "object") return;

    if (Array.isArray(obj.CPU)) {
      obj.CPU = normalizeCpu(obj.CPU);
    }
    if (obj.CPU && typeof obj.CPU === "object" && Array.isArray(obj.CPU.Name)) {
      obj.CPU.Name = joinPlus(obj.CPU.Name);
    }
    if (Array.isArray(obj["CPU.Name"])) {
      obj["CPU.Name"] = joinPlus(obj["CPU.Name"]);
    }
  };

  touch(update);
  touch(update.$set);
  touch(update.$setOnInsert);
}
for (const op of ["findOneAndUpdate", "updateOne", "updateMany"]) {
  computerMetadataSchema.pre(op, function () {
    fixCpuShapeInUpdate(this.getUpdate());
  });
}

computerMetadataSchema.index({ "OS.InstallDate": 1 });
computerMetadataSchema.index({ "System.TotalRAM_GB": 1 });
computerMetadataSchema.index({ "NICs.SpeedMbps": 1 });
computerMetadataSchema.index({ "Storage.MediaType": 1 });
computerMetadataSchema.index({ "Storage.SizeGB": 1 });
computerMetadataSchema.index({ "GPUs.VRAM_GB": 1 });

const ComputerMetadata = mongoose.model(
  "ComputerMetadata",
  computerMetadataSchema
);
export default ComputerMetadata;
