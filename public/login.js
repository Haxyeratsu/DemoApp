const form = document.getElementById('loginForm');
const messageEl = document.getElementById('message');

form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    messageEl.textContent = '';
    messageEl.className = '';

    if (!username || !password) {
        messageEl.textContent = 'Please fill in all fields.';
        messageEl.className = 'error';
        return;
    }

    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const result = await response.json();

        if (response.ok) {
            messageEl.textContent = result.message;
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 1000);
        } else {
            messageEl.textContent = result.message;
            messageEl.className = 'error';
        }

    } catch (error) {
        messageEl.textContent = 'Error connecting to server.';
        messageEl.className = 'error';
        console.error('Error:', error);
    }
});