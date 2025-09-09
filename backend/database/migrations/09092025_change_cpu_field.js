import ComputerMetadata from "../../models/ComputerMetadata.js";

await ComputerMetadata.updateMany(
  { "CPU.Name": { $type: "array" } },
  [
    {
      $set: {
        "CPU.Name": {
          $reduce: {
            input: "$CPU.Name",
            initialValue: "",
            in: {
              $cond: [
                { $eq: ["$$value", ""] },
                { $toString: "$$this" },
                { $concat: ["$$value", " + ", { $toString: "$$this" }] }
              ]
            }
          }
        }
      }
    }
  ]
);
