const express = require('express');
const http = require('http');
const bodyParser = require('body-parser');
const util = require('../core/app');
const letsencrypt = require('../core/letsencrypt');
const auth = require('../core/auth');
const fs = require('fs');
const path = require('path');
const job = require('../core/job');

const app = express();
const httpServer = http.createServer(app);

async function api (req, res, next) {
    const token = req.headers['x-auth-token'] || '';
    if (!token) {
        return res.locals.error('Missing auth token', 401);
    }
    util.log('token', token);
    const check = await auth.verify(token).catch(e => {
        res.locals.error(e.message, 401);
        return false;
    });
    if (check === true) {
        return next();
    }
}

async function main () {
    app.use(function (req, res, next) {
        res.locals.error = function (message, type = 400) {
            res.status(type);
            return res.send({
                error: true,
                message: message
            });
        };

        res.locals.error = function (message) {
            res.send(message);
        };

        res.locals.notFound = function () {
            this.error('Object not found', 400);
        };

        res.locals.success = function (data) {
            res.send(data);
        };
        return next();
    });
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({
        extended: true
    }));

    app.get('/heartbeat', function (req, res) {
        res.header('SE-Heartbeat', '1');
        res.send({
            success: true
        });
    });

    app.get('/.well-known/acme-challenge/*', function (req, res) {
        const certFile = path.join('/app/manager/public' + req.path);
        util.log('acme challenge:', req.path, certFile);
        if (fs.existsSync(certFile)) {
            util.log(' -> success');
            return res.send(
                fs.readFileSync(certFile, 'utf-8')
            );
        }
        util.log(' -> 404');
        res.status(404).send('');
    });

    app.all('/api/*', api);

    app.get('/api/jobs/:id', async function (req, res) {
        res.locals.success(await job.get(req.params.id));
    });

    app.post('/api/jobs/:id/webhooks', async function (req, res) {
        await job.sendWebhook(req.params.id);
        res.locals.success(true);
    });

    app.get('/api/certs/:domain', async function (req, res) {
        const cert = await letsencrypt.getCert(req.params.domain);
        if (!cert) {
            return res.locals.notFound();
        }
        res.locals.success(cert);
    });

    app.post('/api/certs', async function (req, res) {
        const body = req.body;
        const email = body.email || '';
        const domain = body.domain || '';
        if (!email.length) {
            return res.locals.error('Missing email.');
        }
        if (!domain.length) {
            return res.locals.error('Missing domain.');
        }
        const activeJob = await job.create({
            email: email,
            domain: domain,
            notify: body.notify || null,
            force: body.force || false
        });

        util.execute('node /app/console job ' + activeJob);
        res.send({
            processing: activeJob
        });
    });

    app.use(function (req, res) {
        res.send('Page not found.');
    });

    httpServer.listen(3000);
}

main()
    .catch(e => {
        console.log('Error:');
        console.log(e);
    });
