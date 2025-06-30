import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const OLD_DB = "ip-addresser";
const NEW_DB = "net-desk";
const MONGO_URI = process.env.MONGO_URI.replace(/\/[^/]+$/, "");

export default async function () {
  const oldConn = await mongoose
    .createConnection(`${MONGO_URI}/${OLD_DB}`)
    .asPromise();
  const newConn = await mongoose
    .createConnection(`${MONGO_URI}/${NEW_DB}`)
    .asPromise();

  const collections = await oldConn.db.listCollections().toArray();

  for (const { name } of collections) {
    const docs = await oldConn.collection(name).find().toArray();
    if (docs.length > 0) {
      await newConn.collection(name).insertMany(docs);
      console.log(`✅ Kopirana kolekcija: ${name} (${docs.length} dokumenata)`);
    } else {
      console.log(`ℹ️ Kolekcija ${name} je prazna — preskačem`);
    }
  }

  // Obrisati staru bazu
  await oldConn.dropDatabase();
  console.log(`🗑️ Stara baza '${OLD_DB}' je obrisana.`);

  await oldConn.close();
  await newConn.close();

  console.log("✅ Preimenovanje baze završeno.");
  process.exit(0);
}
