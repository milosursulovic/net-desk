import mongoose from "mongoose";
import { ipToNumeric, isValidIPv4 } from "../utils/ip.js";

const printerSchema = new mongoose.Schema(
  {
    name: { type: String, index: true },
    manufacturer: String,
    model: String,
    serial: { type: String, unique: true, sparse: true },
    department: { type: String, index: true },

    connectionType: {
      type: String,
      enum: ["USB", "Network", "Other"],
      default: "Network",
    },

    ip: {
      type: String,
      validate: {
        validator: (v) => v == null || v === "" || isValidIPv4(v),
        message: (props) => `Neispravan IPv4: ${props.value}`,
      },
    },
    ipNumeric: { type: Number, index: true },

    shared: { type: Boolean, default: false },

    hostComputer: { type: mongoose.Schema.Types.ObjectId, ref: "IpEntry" },
    connectedComputers: [
      { type: mongoose.Schema.Types.ObjectId, ref: "IpEntry" },
    ],
  },
  { timestamps: true }
);

printerSchema.pre("validate", function (next) {
  if (this.isModified("ip")) {
    if (this.ip == null || this.ip === "") {
      this.ipNumeric = undefined;
    } else {
      if (!isValidIPv4(this.ip)) {
        return next(new Error(`Neispravan IPv4: ${this.ip}`));
      }
      this.ipNumeric = ipToNumeric(this.ip);
    }
  }
  next();
});

printerSchema.index({ ipNumeric: 1, name: 1 });
printerSchema.index({ hostComputer: 1 });
printerSchema.index({ connectedComputers: 1 });

const Printer = mongoose.model("Printer", printerSchema);
export default Printer;
