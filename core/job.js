const redis = require('./redis');
const letsencrypt = require('./letsencrypt');
const app = require('./app');

async function createJob (data) {
    const id = new Date().getTime();
    const job = {
        id: id,
        ...data
    };
    await redis.publisher.sAdd('jobs', id);
    await redis.publisher.set('jobs:' + id, JSON.stringify(job));
    return id;
}

async function getJob (id) {
    let job = await redis.publisher.get('jobs:' + id);
    if (!job) {
        return false;
    }
    return JSON.parse(job);
}

async function clearJob (id) {
    await redis.publisher.sRem('jobs', id);
    await redis.publisher.del('jobs:' + id);
}

async function runJob (id) {
    const response = await new Promise(async function (resolve) {
        app.log('Run job: ' + id);
        const job = await getJob(id);
        if (!job) {
            app.log('Not a valid job: ' + id);
            return resolve(false);
        }
        const tryCert = async function tryAgain () {
            return letsencrypt.certbot(job)
                .then(() => resolve(true))
                .catch(async e => {
                    if (e.message === 'DOMAIN_DNS_FAILED') {
                        app.log('DNS failed, waiting...');
                        setTimeout(async () => {
                            app.log('trying again...');
                            await tryAgain();
                        }, 60000);
                    } else {
                        app.log('completed!');
                        resolve(true);
                    }
                });
        };
        await tryCert();
    });
    await clearJob(id);
    if (response) {
        // await updateConf().catch(handleCatch);
        redis.publisher.publish(redis.channel, JSON.stringify({
            action: 'nginx:update'
        }));
    }
    app.log('Job completed: ' + id);
    return true;
}

module.exports = {
    runJob: runJob,
    createJob: createJob
};
