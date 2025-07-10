import mongoose from "mongoose";

const ipEntrySchema = new mongoose.Schema({
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
});

ipEntrySchema.pre("save", function (next) {
  if (this.ip) {
    this.ipNumeric = this.ip
      .split(".")
      .reduce((acc, octet) => (acc << 8) + parseInt(octet), 0);
  }
  next();
});

const IpEntry = mongoose.model("IpEntry", ipEntrySchema);

export default IpEntry;
