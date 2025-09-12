import mongoose from "mongoose";
import { ipToNumeric, isValidIPv4 } from "../utils/ip.js";

const ipEntrySchema = new mongoose.Schema(
  {
    ip: {
      type: String,
      required: true,
      unique: true,
      validate: {
        validator: (v) => isValidIPv4(v),
        message: (props) => `Neispravan IPv4: ${props.value}`,
      },
    },
    ipNumeric: { type: Number, required: true, index: true, unique: true },

    computerName: { type: String, index: true },
    username: String,
    fullName: String,
    password: String, // ostaje u bazi; ne izvozimo ga u XLSX u rutama
    rdp: String,
    dnsLog: String,
    anyDesk: String,
    system: String,
    department: { type: String, index: true },

    metadata: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ComputerMetadata",
      unique: true,
      sparse: true,
    },
  },
  { timestamps: true }
);

/** Usklađeno sa utils/ip: automatski računamo ipNumeric i validiramo ip **/
ipEntrySchema.pre("validate", function (next) {
  if (this.isModified("ip")) {
    if (!isValidIPv4(this.ip)) {
      return next(new Error(`Neispravan IPv4: ${this.ip}`));
    }
    this.ipNumeric = ipToNumeric(this.ip);
  }
  next();
});

/** Virtuals za štampače (ostaju kao kod tebe) **/
ipEntrySchema.virtual("printersHosted", {
  ref: "Printer",
  localField: "_id",
  foreignField: "hostComputer",
  justOne: false,
});

ipEntrySchema.virtual("printersConnected", {
  ref: "Printer",
  localField: "_id",
  foreignField: "connectedComputers",
  justOne: false,
});

ipEntrySchema.set("toJSON", { virtuals: true });
ipEntrySchema.set("toObject", { virtuals: true });

/** Indeksi korisni za listanje/sortiranje **/
ipEntrySchema.index({ ipNumeric: 1 });
ipEntrySchema.index({ department: 1 });
ipEntrySchema.index({ computerName: 1 });

const IpEntry = mongoose.model("IpEntry", ipEntrySchema);
export default IpEntry;
