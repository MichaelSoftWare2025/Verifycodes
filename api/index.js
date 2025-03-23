const express = require("express");
const fs = require("fs");
const crypto = require("crypto");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server); // Инициализация socket.io

app.use(express.json()); // Для обработки JSON в теле запроса

const CODES_FILE = "/tmp/codes.json"; // Используем /tmp для хранения данных в серверлес-среде на Render

// Функция для загрузки данных из файла
function loadCodes() {
    try {
        if (fs.existsSync(CODES_FILE)) {
            return JSON.parse(fs.readFileSync(CODES_FILE, "utf-8"));
        }
        return {}; // Возвращаем пустой объект, если файл не существует
    } catch (err) {
        console.error(err);
        return {};
    }
}

// Функция для сохранения данных в файл
function saveCodes(codes) {
    try {
        fs.writeFileSync(CODES_FILE, JSON.stringify(codes, null, 4), "utf-8");
    } catch (err) {
        console.error(err);
    }
}

let codes = loadCodes();

// Периодическое обновление кодов (удаляем старые коды через 20 секунд)
setInterval(() => {
    Object.keys(codes).forEach((key) => {
        if (codes[key].time >= 20) {
            delete codes[key];
        } else {
            codes[key].time += 1;
        }
    });
    saveCodes(codes); // Сохраняем обновленные данные
    io.emit('codesUpdated'); // Отправляем событие клиенту, чтобы обновить страницу
}, 1000);

// Функция для получения уникального хэша юзер-агента
function getUserAgent(req) {
    return crypto.createHash("md5").update(req.headers["user-agent"] || "").digest("hex");
}

// Обработка GET-запросов (для получения кодов)
app.get("/", (req, res) => {
    const userAgent = getUserAgent(req);
    const userCodes = Object.values(codes)
        .filter(entry => entry.to === userAgent)
        .reduce((acc, entry) => {
            // Здесь для каждого отправителя добавляем его код в массив
            if (!acc[entry.from]) {
                acc[entry.from] = [];
            }
            acc[entry.from].push(entry.code);
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
                    <tr><th>От</th><th>Коды</th></tr>
                    ${Object.entries(userCodes).map(([sender, codesArray]) => `
                        <tr><td>${sender}</td><td>${codesArray.join(', ')}</td></tr>
                    `).join('')}
                </table>
            ` : `<p>У вас пока нет полученных кодов.</p>`}
            <footer>
                <p>Ваш юзер агент: ${userAgent}</p>
            </footer>

            <!-- Подключение Socket.IO -->
            <script src="/socket.io/socket.io.js"></script>
            <script>
                const socket = io();
                // Обработчик события обновления кодов
                socket.on('codesUpdated', () => {
                    location.reload(); // Перезагружаем страницу
                });
            </script>
        </body>
        </html>
    `);
});

// Обработка POST-запросов (для отправки кодов)
app.post("/", (req, res) => {
    const { to, from, code } = req.body;
    if (!to || !from || !code) {
        return res.status(400).json({ success: false, error: "Missing fields" });
    }

    // Если уже есть коды для получателя, добавляем новый код в массив
    if (!codes[to]) {
        codes[to] = [];
    }
    codes[to].push({ from, code, time: 0 });

    saveCodes(codes); // Сохраняем данные

    io.emit('codesUpdated'); // Отправляем событие всем клиентам

    res.status(200).json({ success: true });
});

// Установка порта из переменной окружения, по умолчанию 80
const PORT = process.env.PORT || 80;

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
