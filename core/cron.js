const redis = require('./redis');

async function main () {
    setInterval(async function () {
        redis.publisher.publish(redis.channel, 'ping');
    }, 10000);
}

redis.subscriber.subscribe(redis.channel);

main()
    .then(() => {
        console.log('Cron started...');
    })
    .catch(e => {
        console.log(e);
    });
