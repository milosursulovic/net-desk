export const requireEnv = (key, fallback = undefined) => {
    const val = process.env[key] ?? fallback;
    if (val === undefined || val === "") {
        console.error(`❌ Missing required env: ${key}`);
        process.exit(1);
    }
    return val;
};
