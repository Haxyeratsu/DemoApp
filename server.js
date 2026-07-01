const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 9999;

app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'your-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        maxAge: 86400000 //24 hours
    }
}));

// User data
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

// Authentication logging middleware
function authenticationEvent(req, res, next) {
    if (req.session.user) {
        console.log(`User authenticated: ${req.session.user.username}`);
        req.user = req.session.user;
    } else {
        console.log('User not authenticated');
    }
    next();
}

// Protected route middleware
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

// Login endpoint
app.post('/login', (req, res) => {
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

    // In production, use bcrypt.compare()
    if (password !== user.password) {
        return res.status(401).json({
            success: false,
            message: 'Invalid password.'
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

// Signup endpoint
app.post('/signup', (req, res) => {
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

    const newUser = {
        id: Date.now().toString(),
        username: username,
        password: password
    };

    users.push(newUser);
    writeUsers(users);

    console.log(`New user registered: ${username}`);

    res.json({
        success: true,
        message: `Account created for ${username}.`
    });
});

// Logout endpoint
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

// Protected routes
app.get('/dashboard', requireAuth, (req, res) => {
    res.send(`
        <h1>Dashboard</h1>
        <p>Welcome, ${req.user.username}.</p>
        <p>You are authenticated and can view this page.</p>
        <button onclick="logout()">Logout</button>
        <script>
            async function logout() {
                const response = await fetch('/logout', { method: 'POST' });
                const data = await response.json();
                if (data.success) {
                    window.location.href = '/';
                }
            }
        </script>
    `);
});

app.get('/helloroute', requireAuth, (req, res) => {
    res.send(`
        <h1>Hello Route</h1>
        <p>Authenticated user: ${req.user.username}</p>
        <a href="/dashboard">Dashboard</a>
        <a href="/logout" onclick="event.preventDefault(); fetch('/logout', {method:'POST'}).then(() => window.location.href='/');">Logout</a>
    `);
});

//Authentication status endpoint
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

app.listen(port, () => console.log(`Server running on port ${port}`));