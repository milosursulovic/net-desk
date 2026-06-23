import * as softwareService from "../services/softwareSync.service.js";

export async function createSoftwareSync(req, res) {
  try {
    const result = await softwareService.sync(req.body);
    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false });
  }
}
