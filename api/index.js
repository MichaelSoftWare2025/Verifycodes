const fs = require("fs");
const crypto = require("crypto");

const CODES_FILE = "/tmp/codes.json"; // Use /tmp for serverless deployments on Render

function loadCodes() {
    try {
        if (fs.existsSync(CODES_FILE)) {
            return JSON.parse(fs.readFileSync(CODES_FILE, "utf-8"));
        }
        return {};
    } catch (err) {
        console.error(err);
        return {};
    }
}

function saveCodes(codes) {
    try {
        fs.writeFileSync(CODES_FILE, JSON.stringify(codes, null, 4), "utf-8");
    } catch (err) {
        console.error(err);
    }
}

let codes = loadCodes();

setInterval(() => {
    Object.keys(codes).forEach((key) => {
        if (codes[key].time >= 20) {
            delete codes[key];
        } else {
            codes[key].time += 1;
        }
    });
    saveCodes(codes);
}, 1000);

function getUserAgent(req) {
    return crypto.createHash("md5").update(req.headers["user-agent"] || "").digest("hex");
}

module.exports = async (req, res) => {
    if (req.method === "GET") {
        const userAgent = getUserAgent(req);
        const userCodes = Object.values(codes)
            .filter(entry => entry.to === userAgent)
            .reduce((acc, entry) => {
                acc[entry.from] = entry.code;
                return acc;
            }, {});

        res.setHeader("Content-Type", "text/html");

        res.status(200).send(`
            <!DOCTYPE html>
            <html lang="ru">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Полученные коды</title>
                <style>
                    body { font-family: Arial, sans-serif; text-align: center; margin: 20px; }
                    h1 { color: #333; }
                    table { width: 50%; margin: auto; border-collapse: collapse; margin-top: 20px; }
                    th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
                    th { background-color: #f4f4f4; }
                    td { background-color: #fafafa; }
                    footer { margin-top: 20px; font-size: 12px; color: #777; }
                </style>
            </head>
            <body>
                <h1>Ваши полученные коды</h1>
                ${Object.keys(userCodes).length > 0 ? `
                    <table>
                        <tr><th>От</th><th>Код</th></tr>
                        ${Object.entries(userCodes).map(([sender, code]) => `
                            <tr><td>${sender}</td><td>${code}</td></tr>
                        `).join('')}
                    </table>
                ` : `<p>У вас пока нет полученных кодов.</p>`}
                <footer>
                    <p>Ваш юзер агент: ${userAgent}</p>
                </footer>
            </body>
            </html>
        `);
    } else if (req.method === "POST") {
        const { to, from, code } = req.body;
        if (!to || !from || !code) {
            return res.status(400).json({ success: false, error: "Missing fields" });
        }

        codes[to] = { to, from, code, time: 0 };
        saveCodes(codes);

        res.status(200).json({ success: true });
    } else {
        res.status(405).json({ error: "Method Not Allowed" });
    }
};
