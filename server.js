const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const XLSX = require('xlsx');

const app = express();
const port = 9999;

app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: '0101010101',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        maxAge: 86400000
    }
}));

const loginLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: {
        success: false,
        message: 'Too many login attempts. Please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

const signupLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 3,
    message: {
        success: false,
        message: 'Too many signup attempts. Please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

const USERS_FILE = path.join(__dirname, 'users.json');

if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([]));
}

function readUsers() {
    try {
        const data = fs.readFileSync(USERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading users file:', error);
        return [];
    }
}

function writeUsers(users) {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        return true;
    } catch (error) {
        console.error('Error writing users file:', error);
        return false;
    }
}

//Authentication middleware
function authenticationEvent(req, res, next) {
    if (req.session.user) {
        console.log(`User authenticated: ${req.session.user.username}`);
        req.user = req.session.user;
    } else {
        console.log('User not authenticated');
    }
    next();
}

function requireAuth(req, res, next) {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/');
    }
}

app.use(authenticationEvent);

// Public routes
app.get('/', (req, res) => {
    if (req.session.user) {
        return res.redirect('/dashboard');
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/signup', (req, res) => {
    if (req.session.user) {
        return res.redirect('/dashboard');
    }
    res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});

// Login endpoint with rate limiting
app.post('/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({
            success: false,
            message: 'Username and password are required.'
        });
    }

    const users = readUsers();
    const user = users.find(u => u.username === username);

    if (!user) {
        return res.status(401).json({
            success: false,
            message: 'User not found. Please sign up first.'
        });
    }

    try {
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid password.'
            });
        }
    } catch (error) {
        console.error('Error comparing passwords:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error.'
        });
    }

    req.session.user = {
        id: user.id,
        username: user.username
    };

    console.log(`User logged in: ${username}`);

    res.json({
        success: true,
        message: `Welcome back, ${username}.`
    });
});

// sign up end point
app.post('/signup', signupLimiter, async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({
            success: false,
            message: 'Username and password are required.'
        });
    }

    if (username.length < 3) {
        return res.status(400).json({
            success: false,
            message: 'Username must be at least 3 characters.'
        });
    }

    if (password.length < 6) {
        return res.status(400).json({
            success: false,
            message: 'Password must be at least 6 characters.'
        });
    }

    const users = readUsers();

    if (users.some(u => u.username === username)) {
        return res.status(400).json({
            success: false,
            message: 'Username already taken.'
        });
    }

    const saltRounds = 10;
    let hashedPassword;
    try {
        hashedPassword = await bcrypt.hash(password, saltRounds);
    } catch (error) {
        console.error('Error hashing password:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error.'
        });
    }

    const newUser = {
        id: Date.now().toString(),
        username: username,
        password: hashedPassword
    };

    users.push(newUser);
    writeUsers(users);

    console.log(`New user registered: ${username}`);

    res.json({
        success: true,
        message: `Account created for ${username}.`
    });
});

app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Error logging out'
            });
        }
        res.json({
            success: true,
            message: 'Logged out successfully'
        });
    });
});

app.get('/helloroute', requireAuth, (req, res) => {
    res.send(`
        <h1>Hello Route</h1>
        <p>Authenticated user: ${req.user.username}</p>
        <a href="/dashboard">Dashboard</a>
        <a href="/logout" onclick="event.preventDefault(); fetch('/logout', {method:'POST'}).then(() => window.location.href='/');">Logout</a>
    `);
});

app.get('/auth/status', (req, res) => {
    if (req.session.user) {
        res.json({
            authenticated: true,
            user: req.session.user
        });
    } else {
        res.json({
            authenticated: false
        });
    }
});

// payment user
function getPaymentsForUser(userId) {
    const userPaymentsFile = path.join(__dirname, 'data', 'user_payments', `${userId}.json`);
    if (fs.existsSync(userPaymentsFile)) {
        try {
            const data = fs.readFileSync(userPaymentsFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error(`Error reading user payments for ${userId}:`, error);
            return [];
        }
    }

    const filePath = path.join(__dirname, 'data', 'payments.xlsx');
    if (!fs.existsSync(filePath)) {
        return [];
    }
    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);
    return rows.filter(row => String(row.userId) === String(userId));
}

// dashboard route
app.get('/dashboard', requireAuth, (req, res) => {
    const userId = req.user.id;
    const payments = getPaymentsForUser(userId);

    const salesByDate = {};
    payments.forEach(p => {
        if (salesByDate[p.date]) {
            salesByDate[p.date] += parseFloat(p.amount) || 0;
        } else {
            salesByDate[p.date] = parseFloat(p.amount) || 0;
        }
    });

    const sortedDates = Object.keys(salesByDate).sort((a, b) => {
        const partsA = a.split('/');
        const partsB = b.split('/');
        const dateA = new Date(partsA[2], partsA[1] - 1, partsA[0]);
        const dateB = new Date(partsB[2], partsB[1] - 1, partsB[0]);
        return dateA - dateB;
    });

    const chartLabels = JSON.stringify(sortedDates);
    const chartData = JSON.stringify(sortedDates.map(date => salesByDate[date]));

    // chart
    const salesByCategory = {};
    payments.forEach(p => {
        if (salesByCategory[p.description]) {
            salesByCategory[p.description] += parseFloat(p.amount) || 0;
        } else {
            salesByCategory[p.description] = parseFloat(p.amount) || 0;
        }
    });

    const pieLabels = JSON.stringify(Object.keys(salesByCategory));
    const pieValues = JSON.stringify(Object.values(salesByCategory));

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Dashboard</title>
            <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
            <style>
                * { box-sizing: border-box; font-family: Arial, sans-serif; }
                body { padding: 20px; background: #f5f5f5; }
                .dashboard { max-width: 1200px; margin: 0 auto; }
                .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
                .header h1 { margin: 0; }
                .logout-btn { padding: 10px 20px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; }
                .logout-btn:hover { background: #c82333; }
                .charts-container {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 20px;
                    margin-bottom: 30px;
                }
                .chart-box {
                    background: white;
                    padding: 20px;
                    border-radius: 8px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                }
                .chart-box h3 { margin-top: 0; text-align: center; }
                .chart-box canvas { max-height: 300px; max-width: 100%; }
                .table-container {
                    background: white;
                    padding: 20px;
                    border-radius: 8px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                    margin-top: 20px;
                }
                .table-container h3 { margin-top: 0; }
                table {
                    width: 100%;
                    border-collapse: collapse;
                }
                th, td {
                    padding: 10px;
                    text-align: left;
                    border-bottom: 1px solid #ddd;
                }
                th { background: #f8f9fa; font-weight: 600; }
                .drop-zone {
                    border: 2px dashed #ccc;
                    padding: 30px;
                    text-align: center;
                    margin: 20px 0;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: all 0.3s;
                }
                .drop-zone:hover { border-color: #007bff; background: #f0f8ff; }
                .drop-zone.dragover { border-color: #007bff; background: #e6f0ff; }
                .upload-status { margin: 10px 0; padding: 8px; border-radius: 4px; }
                .upload-status.success { color: #28a745; }
                .upload-status.error { color: #dc3545; }
                .no-data { text-align: center; color: #6c757d; padding: 20px; }
            </style>
        </head>
        <body>
            <div class="dashboard">
                <div class="header">
                    <h1>Dashboard</h1>
                    <div>
                        <span style="margin-right: 15px;">Welcome, ${req.user.username}.</span>
                        <button class="logout-btn" onclick="logout()">Logout</button>
                    </div>
                </div>

                ${payments.length === 0 ? `
                <div class="no-data">
                    <p>No payments found. Upload an Excel file to see your data.</p>
                </div>
                ` : `
                <div class="charts-container">
                    <div class="chart-box">
                        <h3>Sales Over Time</h3>
                        <canvas id="lineChart"></canvas>
                    </div>
                    <div class="chart-box">
                        <h3>Sales by Category</h3>
                        <canvas id="pieChart"></canvas>
                    </div>
                </div>
                `}

                <div class="table-container">
                    <h3>Your Payments</h3>
                    ${payments.length === 0 ? '<p class="no-data">No payments found.</p>' : `
                    <table>
                        <thead>
                            <tr><th>Amount</th><th>Date</th><th>Description</th></tr>
                        </thead>
                        <tbody>
                            ${payments.map(p => `
                                <tr>
                                    <td>€${parseFloat(p.amount).toFixed(2)}</td>
                                    <td>${p.date}</td>
                                    <td>${p.description}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    `}
                </div>

                <div style="margin-top: 20px;">
                    <h3>Import Payments</h3>
                    <div class="drop-zone" id="dropZone">
                        Drag and drop an Excel file here, or click to select.
                        <input type="file" id="fileInput" accept=".xlsx,.xls" style="display: none;">
                    </div>
                    <div id="uploadStatus" class="upload-status"></div>
                </div>
            </div>

            <script>
                async function logout() {
                    const response = await fetch('/logout', { method: 'POST' });
                    const data = await response.json();
                    if (data.success) {
                        window.location.href = '/';
                    }
                }

                ${payments.length > 0 ? `
                // Line Chart: Sales Over Time
                (function() {
                    const ctx = document.getElementById('lineChart').getContext('2d');
                    const labels = ${chartLabels};
                    const data = ${chartData};

                    new Chart(ctx, {
                        type: 'line',
                        data: {
                            labels: labels,
                            datasets: [{
                                label: 'Sales Amount (EUR)',
                                data: data,
                                borderColor: 'rgba(75, 255, 99, 0.52)',
                                backgroundColor: 'rgba(33, 99, 42, 0.52)',
                                tension: 0.3,
                                fill: true
                            }]
                        },
                        options: {
                            responsive: true,
                            plugins: {
                                legend: { display: true, position: 'top' }
                            },
                            scales: {
                                y: {
                                    beginAtZero: true,
                                    ticks: {
                                        callback: function(value) { return '€' + value; }
                                    }
                                }
                            }
                        }
                    });
                })();

                // Pie Chart: Sales by Category
                (function() {
                    const ctx = document.getElementById('pieChart').getContext('2d');
                    const labels = ${pieLabels};
                    const data = ${pieValues};

                    const colors = [
                        '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0',
                        '#9966FF', '#FF9F40', '#FF6384', '#C9CBCF'
                    ];

                    new Chart(ctx, {
                        type: 'pie',
                        data: {
                            labels: labels,
                            datasets: [{
                                data: data,
                                backgroundColor: colors.slice(0, labels.length),
                                borderWidth: 1
                            }]
                        },
                        options: {
                            responsive: true,
                            plugins: {
                                legend: { position: 'right' },
                                tooltip: {
                                    callbacks: {
                                        label: function(context) {
                                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                            const percentage = ((context.parsed / total) * 100).toFixed(1);
                                            return '€' + context.parsed + ' (' + percentage + '%)';
                                        }
                                    }
                                }
                            }
                        }
                    });
                })();
                ` : ''}

                // Drag and drop logic
                (function() {
                    const dropZone = document.getElementById('dropZone');
                    const fileInput = document.getElementById('fileInput');
                    const status = document.getElementById('uploadStatus');

                    dropZone.addEventListener('click', () => fileInput.click());

                    fileInput.addEventListener('change', (e) => {
                        if (fileInput.files.length) {
                            uploadFile(fileInput.files[0]);
                        }
                        fileInput.value = '';
                    });

                    dropZone.addEventListener('dragover', (e) => {
                        e.preventDefault();
                        dropZone.classList.add('dragover');
                    });

                    dropZone.addEventListener('dragleave', () => {
                        dropZone.classList.remove('dragover');
                    });

                    dropZone.addEventListener('drop', (e) => {
                        e.preventDefault();
                        dropZone.classList.remove('dragover');
                        const files = e.dataTransfer.files;
                        if (files.length) {
                            uploadFile(files[0]);
                        }
                    });

                    async function uploadFile(file) {
                        const formData = new FormData();
                        formData.append('file', file);

                        status.textContent = 'Uploading...';
                        status.className = 'upload-status';

                        try {
                            const response = await fetch('/upload', {
                                method: 'POST',
                                body: formData
                            });

                            const result = await response.json();

                            if (response.ok) {
                                status.textContent = 'Upload successful: ' + result.message + ' (Reloading...)';
                                status.className = 'upload-status success';
                                setTimeout(() => window.location.reload(), 1500);
                            } else {
                                status.textContent = 'Error: ' + result.message;
                                status.className = 'upload-status error';
                            }
                        } catch (error) {
                            status.textContent = 'Network error. Please try again.';
                            status.className = 'upload-status error';
                            console.error('Upload error:', error);
                        }
                    }
                })();
            </script>
        </body>
        </html>
    `);
});

const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

function excelSerialToDate(serial) {
    if (typeof serial !== 'number') return serial;
    const epoch = new Date(1899, 11, 30);
    const date = new Date(epoch.getTime() + serial * 86400000);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

app.post('/upload', requireAuth, upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    if (!['.xlsx', '.xls'].includes(ext)) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ success: false, message: 'Only Excel files are allowed.' });
    }

    try {
        const workbook = XLSX.readFile(req.file.path);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet);

        fs.unlinkSync(req.file.path);

        const normalizedRows = rows.map(row => {
            const newRow = {};
            Object.keys(row).forEach(key => {
                const value = row[key];
                const lowerKey = key.toLowerCase();
                if (lowerKey.includes('date') || lowerKey.includes('time')) {
                    newRow[key] = typeof value === 'number' ? excelSerialToDate(value) : value;
                } else {
                    newRow[key] = value;
                }
            });
            return newRow;
        });

        const userId = req.user.id;
        const userPaymentsDir = path.join(__dirname, 'data', 'user_payments');
        if (!fs.existsSync(userPaymentsDir)) {
            fs.mkdirSync(userPaymentsDir, { recursive: true });
        }
        const userPaymentsFile = path.join(userPaymentsDir, `${userId}.json`);
        fs.writeFileSync(userPaymentsFile, JSON.stringify(normalizedRows, null, 2));

        res.json({
            success: true,
            data: normalizedRows,
            message: `Imported ${normalizedRows.length} rows.`
        });
    } catch (error) {
        console.error('Error parsing Excel:', error);
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ success: false, message: 'Error processing file.' });
    }
});

app.listen(port, () => console.log(`Server running on port ${port}`));