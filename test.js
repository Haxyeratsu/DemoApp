const express = require('express')
const app = express()
const port = 9999

app.use(express.static('public'))
app.use(authenticationEvent)

function authenticationEvent(req, res, next) {
    console.log('You are not Authenticated')
    //if ()
}

//ROUTES
app.get('/helloroute', (req, res) => {
    res.send('<h1> HELLO ROUTE </h1>')
})

app.listen(port, () => console.log('Server IS RUNNING'))