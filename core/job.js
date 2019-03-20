const fetch = require('node-fetch');
const redis = require('./redis');
const letsencrypt = require('./letsencrypt');
const app = require('./app');

exports.create = async function (data) {
    const id = new Date().getTime();
    const job = {
        id: id,
        ...data
    };
    await redis.publisher.sAdd('jobs', id);
    await redis.publisher.set('jobs:' + id, JSON.stringify(job));
    return id;
};

exports.get = async function (id) {
    let job = await redis.publisher.get('jobs:' + id);
    if (!job) {
        return false;
    }
    job = JSON.parse(job);
    job.status = 'pending';
    if (await redis.publisher.sIsMember('jobsCompleted', id)) {
        job.status = 'live';
    }

    return job;
};

exports.sendWebhook = async function (id, error = null) {
    const activeJob = await this.get(id);
    app.log('activeJob', activeJob);
    console.log('activeError', error);
    if (activeJob.notify) {
        const props = {};
        if (error) {
            props.error = {
                message: error.message,
                description: error.description
            };
        } else {
            const domains = [];
            for (let domain of activeJob.domain.split(',')) {
                const cert = await letsencrypt.getCert(domain.trim());
                if (cert) {
                    domains.push(cert);
                }
            }
            props.domains = domains;
        }
        const response = await fetch(activeJob.notify, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                job: activeJob,
                ...props
            })
        }).catch(app.handleCatch);

        if (response) {
            app.log(await response.text());
        }
    }
};

exports.clear = async function (id) {
    await redis.publisher.sRem('jobs', id);
    await redis.publisher.sRem('jobsRunning', id);
    await redis.publisher.sAdd('jobsCompleted', id);
};

exports.run = async function (id) {
    await redis.publisher.sAdd('jobsRunning', id);
    let lastError = null;
    const response = await new Promise(async (resolve, reject) => {
        app.log('Run job: ' + id);
        const job = await this.get(id);
        if (!job) {
            app.log('Not a valid job: ' + id);
            return reject(new Error('Not a valid job'));
        }
        const tryCert = async function tryAgain () {
            return letsencrypt.certbot(job)
                .then(() => resolve(true))
                .catch(async e => {
                    const error = app.parseError(e);
                    if (error.message === 'DOMAIN_DNS_FAILED') {
                        app.log('DNS failed, waiting...');
                        setTimeout(async () => {
                            app.log('trying again...');
                            await tryAgain();
                        }, 60000);
                    } else {
                        reject(error);
                    }
                });
        };
        await tryCert();
    }).catch(e => {
        lastError = app.parseError(e);
        if (lastError.message === 'DOMAIN_ALREADY_EXISTS') {
            lastError = null;
        }
        return false;
    });
    await this.clear(id);
    if (response) {
        redis.publisher.publish(redis.channel, JSON.stringify({
            action: 'nginx:update'
        }));
    }
    await this.sendWebhook(id, lastError).catch(app.handleCatch);
    app.log('Job completed: ' + id);
    return true;
};
