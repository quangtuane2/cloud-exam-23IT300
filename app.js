require('dotenv').config();
const dns = require('node:dns');
const express = require('express');
const { MongoClient } = require('mongodb');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const path = require('path');

const dnsServers = process.env.DNS_SERVERS
    ?.split(',')
    .map(server => server.trim())
    .filter(Boolean);
if (dnsServers?.length) dns.setServers(dnsServers);

const app = express();
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));

// MongoDB clients use separate read, write, and session credentials.
const clientSession = new MongoClient(process.env.URI_SESSION);
const clientRead = new MongoClient(process.env.URI_READ);
const clientWrite = new MongoClient(process.env.URI_WRITE);

async function startServer() {
    const clients = [clientSession, clientRead, clientWrite];
    const results = await Promise.allSettled(clients.map(client => client.connect()));
    const failedConnection = results.find(result => result.status === 'rejected');

    if (failedConnection) {
        await Promise.allSettled(clients.map(client => client.close()));
        throw failedConnection.reason;
    }

    app.use(session({
        secret: 'cloud-exam-secret',
        resave: false,
        saveUninitialized: false,
        store: MongoStore.create({ client: clientSession })
    }));

    app.get('/', async (req, res) => {
        if (!req.session.luotTruyCap) req.session.luotTruyCap = 1;
        else req.session.luotTruyCap++;

        const db = clientRead.db('DB_23IT300');
        const sach = await db.collection('sach').find({}).toArray();

        res.render('index', { sach, luotTruyCap: req.session.luotTruyCap });
    });

    app.post('/add', async (req, res) => {
        const { maSP, tenSach, giaGoc } = req.body;

        if (!maSP.startsWith('300')) {
            return res.send("That bai: Ma san pham bat buoc phai co tien to '300'");
        }

        const price = parseFloat(giaGoc);
        const vat = 0.06;
        const giaSauThue = price + (price * vat);

        const db = clientWrite.db('DB_23IT300');
        await db.collection('sach').insertOne({
            maSP,
            tenSach,
            giaGoc: price,
            giaSauThue,
            thueVAT: '6%'
        });

        res.redirect('/');
    });

    const port = process.env.PORT || 3000;
    app.listen(port, () => {
        console.log(`Server chay tai cong ${port}`);
    });
}

startServer().catch(error => {
    console.error(`Khong the khoi dong do loi MongoDB: ${error.message}`);
    process.exitCode = 1;
});