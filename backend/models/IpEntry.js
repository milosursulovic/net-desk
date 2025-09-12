import mongoose from "mongoose";

const ipEntrySchema = new mongoose.Schema(
  {
    ip: String,
    ipNumeric: { type: Number, index: true },
    computerName: String,
    username: String,
    fullName: String,
    password: String,
    rdp: String,
    dnsLog: String,
    anyDesk: String,
    system: String,
    department: String,
    metadata: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ComputerMetadata",
      unique: true,
      sparse: true,
    },
  },
  { timestamps: true }
);

ipEntrySchema.pre("save", function (next) {
  if (this.ip) {
    this.ipNumeric = this.ip
      .split(".")
      .reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0);
  }
  next();
});

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

const IpEntry = mongoose.model("IpEntry", ipEntrySchema);
export default IpEntry;
