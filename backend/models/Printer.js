// models/Printer.js
import mongoose from "mongoose";

const ipToNumeric = (ip) =>
  ip
    ? ip.split(".").reduce((acc, o) => (acc << 8) + parseInt(o, 10), 0)
    : undefined;

const printerSchema = new mongoose.Schema(
  {
    name: { type: String, index: true },
    manufacturer: String,
    model: String,
    serial: { type: String, unique: true, sparse: true },
    department: String,

    connectionType: {
      type: String,
      enum: ["USB", "Network", "Other"],
      default: "Network",
    },
    ip: String,
    ipNumeric: { type: Number, index: true },

    shared: { type: Boolean, default: false },

    hostComputer: { type: mongoose.Schema.Types.ObjectId, ref: "IpEntry" },

    connectedComputers: [
      { type: mongoose.Schema.Types.ObjectId, ref: "IpEntry" },
    ],
  },
  { timestamps: true }
);

printerSchema.pre("save", function (next) {
  if (this.ip) this.ipNumeric = ipToNumeric(this.ip);
  next();
});

const Printer = mongoose.model("Printer", printerSchema);
export default Printer;
