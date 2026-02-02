export const notFound = (req, res, next) => {
    if (req.path === "/health" || req.path === "/ready") return next();
    res.status(404).json({ message: "Ruta nije pronađena" });
};
