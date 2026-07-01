const form = document.getElementById('signupForm');
const messageEl = document.getElementById('message');

form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    messageEl.textContent = '';
    messageEl.className = '';

    if (!username || !password || !confirmPassword) {
        messageEl.textContent = 'Please fill in all fields.';
        messageEl.className = 'error';
        return;
    }

    if (password !== confirmPassword) {
        messageEl.textContent = 'Passwords do not match.';
        messageEl.className = 'error';
        return;
    }

    try {
        const response = await fetch('/signup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const result = await response.json();

        if (response.ok) {
            messageEl.textContent = result.message;
            document.getElementById('username').value = '';
            document.getElementById('password').value = '';
            document.getElementById('confirmPassword').value = '';
            
            setTimeout(() => {
                window.location.href = '/';
            }, 2000);
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