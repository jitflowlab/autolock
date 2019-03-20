const redis = require('../core/redis');
const app = require('../core/app');
const nginx = require('../core/nginx');
const moment = require('moment');

redis.subscriber.on('message', async (name, message) => {
    if (typeof message === 'string' && message === 'ping') {
        app.log('-- pong [' + moment().toISOString() + '] --');
        return null;
    }
    if (name === redis.channel) {
        try {
            message = JSON.parse(message);
            switch (message.action) {
                case 'nginx:update':
                    nginx.update()
                        .then(() => {
                            console.log('Nginx reloaded...');
                        })
                        .catch(app.handleCatch);
                    break;
            }
        } catch (e) {}
    }
});

async function main () {
    redis.subscriber.subscribe(redis.channel);
    await new Promise(resolve => {
        setTimeout(function () {
            redis.publisher.publish(redis.channel, 'ping');
            resolve();
        }, 1000);
    });
}

main()
    .then(() => {
        console.log('Connected to listener...');
    })
    .catch(e => {
        console.log(e);
    });
