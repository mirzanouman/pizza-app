require('dotenv').config()
const express = require('express')
const app = express()
const PORT = process.env.PORT || 3000
const ejs = require('ejs')
const path = require('path')
const expressLayout = require('express-ejs-layouts')
const mongoose = require('mongoose')
const session = require('express-session')
const flash = require('express-flash')
const MongoDbStore = require('connect-mongo')
const passport = require('passport')
const Emitter = require('events')
const multer = require('multer')

// Database connection
const url = 'mongodb://localhost/pizza';

mongoose.connect(url, {
    useNewUrlParser: true, useCreateIndex: true, useUnifiedTopology: true,
    useFindAndModify: true
});

const connection = mongoose.connection;
connection.once('open', () => {
    console.log('Database connected...');
}).catch(err => {
    console.log('Connection failed...')
})

// Event Emitter
const eventEmitter = new Emitter()
app.set('eventEmitter', eventEmitter)

// Session Config
app.use(session({
    secret: process.env.COOKIE_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoDbStore.create({
        mongoUrl: url
    }),
    cookie: { maxAge: 1000 * 60 * 60 } // 24 hours
    // cookie: { maxAge: 1000 * 15 }
}))

// Passport Config
const passportInit = require('./app/config/passport')
passportInit(passport)
app.use(passport.initialize())
app.use(passport.session())

app.use(flash())


// Assets
app.use(express.static(__dirname + '/public')) //Serves resources from public folder
app.use(express.urlencoded({ extended: false }))
// express main by default json data recieve krny ka feature nahi hai
// that why we need to enable this by following command
app.use(express.json())


// Global middleware
app.use((req, res, next) => {
    res.locals.session = req.session
    res.locals.user = req.user
    next()
})

// app.use(bodyParser.json());
// app.use(bodyParser.urlencoded({extended: true}));


app.use(expressLayout)
app.set('views', path.join(__dirname, '/resources/views'))
app.set('view engine', 'ejs')


// Routes
require('./routes/web')(app)
// End

// Image Uploading
var storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/')
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + file.originalname)
    }
})
var upload = multer({
    storage: storage
})

const Item = require('./app/models/menu')


const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`)
})

// this route is for items uploading with image

app.post('/postItems', upload.single("file"), (req, res) => {
    const { name, price, size } = req.body;

    const item = new Item({
        name,
        image: req.file.filename,
        price,
        size
    }).save()
        .then((item) => {
            // Login
            return res.redirect('/admin/items')
        }).catch(err => {
            req.flash('error', 'Something went wrong')
            return res.redirect('/admin/addItems')
        })
})

// this route is for update items uploading with image

app.post('/updateItems/:id', upload.single("file"), (req, res) => {
    const { name, price, size } = req.body;

    const item = {
        name,
        image: req.file.filename,
        price,
        size
    }
    Item.findByIdAndUpdate(req.params.id, item, function (err, user) {
        if (err) {
            res.redirect('edit/' + req.params.id);
        } else {
            res.redirect('/admin/items');
        }
    });
})

// Socket Connection

const io = require('socket.io')(server)
io.on('connection', (socket) => {
    //Join 
    socket.on('join', (orderId) => {
        socket.join(orderId)
    })
})

// this is for update order status in customer side
eventEmitter.on('orderUpdated', (data) => {
    io.to(`order_${data.id}`).emit('orderUpdated', data)
})

// this is for orderPlaced in admin side
eventEmitter.on('orderPlaced', (data) => {
    io.to('adminRoom').emit('orderPlaced', data)
})